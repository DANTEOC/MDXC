import type { User } from '@supabase/supabase-js';

type ActionError = { message?: string } | null;
type ProfileRoleRow = { role?: string | null };
type ProfileRoleQuery = {
    select: (columns: 'role') => {
        eq: (column: 'id', value: string) => {
            single: () => Promise<{
                data: ProfileRoleRow | null;
                error: ActionError;
            }>;
        };
    };
};

type SupabaseActionClient = {
    auth: {
        getUser: () => Promise<{
            data: { user: User | null };
            error: ActionError;
        }>;
    };
    from: (table: 'profiles') => ProfileRoleQuery;
};

export const VAULT_MANAGER_ROLES = ['ADMIN', 'SUPERVISOR', 'DIRECTOR'] as const;
export const VAULT_VALIDATOR_ROLES = ['ADMIN', 'SUPERVISOR', 'DIRECTOR', 'ANALYST'] as const;

export async function requireAuthenticatedUser(supabase: SupabaseActionClient) {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('Unauthorized');
    }

    return user;
}

export async function requireProfileRole(
    supabase: SupabaseActionClient,
    allowedRoles: readonly string[]
) {
    const user = await requireAuthenticatedUser(supabase);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (error || !profile?.role || !allowedRoles.includes(profile.role)) {
        throw new Error('Forbidden');
    }

    return { user, role: profile.role as string };
}
