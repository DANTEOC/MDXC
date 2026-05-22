import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const GLOBAL_VAULT_ROLES = ['ADMIN', 'DIRECTOR'] as const;
const PROJECT_READER_ROLES = ['SUPERVISOR', 'ANALYST'] as const;
const PROJECT_MANAGER_ROLES = ['SUPERVISOR'] as const;
const PROJECT_VALIDATOR_ROLES = ['SUPERVISOR', 'ANALYST'] as const;

type ProjectAccessResult = {
    user: { id: string };
    role: string;
};

export async function createSupabaseActionClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name: string, options: any) {
                    cookieStore.delete({ name, ...options });
                },
            },
        }
    );
}

export async function requireProjectReader(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    projectId: string
) {
    return requireProjectAccess(supabase, projectId, PROJECT_READER_ROLES, { allowCompanyAccess: true });
}

export async function requireProjectManager(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    projectId: string
) {
    return requireProjectAccess(supabase, projectId, PROJECT_MANAGER_ROLES);
}

export async function requireProjectValidator(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    projectId: string
) {
    return requireProjectAccess(supabase, projectId, PROJECT_VALIDATOR_ROLES);
}

export async function getVaultDocumentProjectId(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    vaultDocumentId: string
) {
    const { data: vaultDocument, error } = await supabase
        .from('vault_documents')
        .select('project_id')
        .eq('id', vaultDocumentId)
        .single();

    if (error || !vaultDocument?.project_id) {
        throw new Error('Vault document not found');
    }

    return vaultDocument.project_id as string;
}

export async function getVaultVersionWithProject(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    versionId: string
) {
    const { data: version, error } = await supabase
        .from('vault_document_versions')
        .select('id, vault_document_id, file_path')
        .eq('id', versionId)
        .single();

    if (error || !version?.vault_document_id || !version?.file_path) {
        throw new Error('Vault document version not found');
    }

    const projectId = await getVaultDocumentProjectId(supabase, version.vault_document_id);

    return {
        id: version.id as string,
        vaultDocumentId: version.vault_document_id as string,
        filePath: version.file_path as string,
        projectId,
    };
}

async function requireProjectAccess(
    supabase: Awaited<ReturnType<typeof createSupabaseActionClient>>,
    projectId: string,
    allowedProjectRoles: readonly string[],
    options: { allowCompanyAccess?: boolean } = {}
): Promise<ProjectAccessResult> {
    if (!projectId) {
        throw new Error('Project id is required');
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

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

    const role = profile.role as string;

    if (GLOBAL_VAULT_ROLES.includes(role as (typeof GLOBAL_VAULT_ROLES)[number])) {
        return { user, role };
    }

    const { data: membership, error: membershipError } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (!membershipError && membership?.role && allowedProjectRoles.includes(membership.role)) {
        return { user, role };
    }

    if (options.allowCompanyAccess && profile.company_id) {
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('client_id, manufacturer_id')
            .eq('id', projectId)
            .single();

        if (
            !projectError &&
            project &&
            (project.client_id === profile.company_id || project.manufacturer_id === profile.company_id)
        ) {
            return { user, role };
        }
    }

    throw new Error('Forbidden');
}
