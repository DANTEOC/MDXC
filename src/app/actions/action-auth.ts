import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseActionClient = Pick<SupabaseClient, 'auth' | 'from'>;

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
