import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const VAULT_WRITE_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'DIRECTOR']);
const VAULT_GLOBAL_ROLES = new Set(['ADMIN', 'DIRECTOR']);
type CookieOptions = Record<string, unknown>;

export const getSupabase = async () => {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                async get(name: string) {
                    return (await cookies()).get(name)?.value;
                },
                async set(name: string, value: string, options: CookieOptions) {
                    (await cookies()).set({ name, value, ...options });
                },
                async remove(name: string, options: CookieOptions) {
                    (await cookies()).delete({ name, ...options });
                },
            },
        }
    );
};

type SupabaseClient = Awaited<ReturnType<typeof getSupabase>>;

async function getAuthenticatedProfile(supabase: SupabaseClient) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        throw new Error('Unauthorized');
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .single();

    if (profileError || !profile?.role) {
        throw new Error('Unauthorized');
    }

    return {
        user,
        profile: profile as { role: string; company_id?: string | null },
    };
}

export async function requireProjectReadAccess(supabase: SupabaseClient, projectId: string) {
    const { user, profile } = await getAuthenticatedProfile(supabase);

    if (VAULT_GLOBAL_ROLES.has(profile.role)) {
        return { user, profile };
    }

    const { data: membership, error: membershipError } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (membershipError) {
        throw new Error(`Error checking project access: ${membershipError.message}`);
    }

    if (membership) {
        return { user, profile };
    }

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('client_id, manufacturer_id')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        throw new Error('Forbidden');
    }

    const companyId = profile.company_id;
    if (companyId && (project.client_id === companyId || project.manufacturer_id === companyId)) {
        return { user, profile };
    }

    throw new Error('Forbidden');
}

export async function requireVaultWriteAccess(supabase: SupabaseClient, projectId: string) {
    const { user, profile } = await getAuthenticatedProfile(supabase);

    if (!VAULT_WRITE_ROLES.has(profile.role)) {
        throw new Error('Forbidden');
    }

    if (VAULT_GLOBAL_ROLES.has(profile.role)) {
        return { user, profile };
    }

    const { data: membership, error: membershipError } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('role', 'SUPERVISOR')
        .maybeSingle();

    if (membershipError) {
        throw new Error(`Error checking project access: ${membershipError.message}`);
    }

    if (!membership) {
        throw new Error('Forbidden');
    }

    return { user, profile };
}

export async function getVaultDocumentProjectId(supabase: SupabaseClient, vaultDocumentId: string) {
    const { data: vaultDocument, error } = await supabase
        .from('vault_documents')
        .select('id, project_id')
        .eq('id', vaultDocumentId)
        .single();

    if (error || !vaultDocument?.project_id) {
        throw new Error('Vault document not found');
    }

    return vaultDocument.project_id as string;
}

export async function assertVaultDocumentBelongsToProject(
    supabase: SupabaseClient,
    vaultDocumentId: string,
    projectId: string
) {
    const actualProjectId = await getVaultDocumentProjectId(supabase, vaultDocumentId);

    if (actualProjectId !== projectId) {
        throw new Error('Vault document does not belong to this project');
    }

    return actualProjectId;
}
