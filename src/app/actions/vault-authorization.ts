import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const VAULT_MANAGER_ROLES = ['ADMIN', 'SUPERVISOR', 'DIRECTOR'] as const;
export const VAULT_VALIDATOR_ROLES = [...VAULT_MANAGER_ROLES, 'ANALYST'] as const;

export const getSupabase = async () => {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                async get(name: string) {
                    return (await cookies()).get(name)?.value;
                },
                async set(name: string, value: string, options: any) {
                    (await cookies()).set({ name, value, ...options });
                },
                async remove(name: string, options: any) {
                    (await cookies()).delete({ name, ...options });
                },
            },
        }
    );
};

export async function requireAuthenticatedUser(supabase: any) {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('Unauthorized');
    }

    return user;
}

export async function requireUserWithRole(supabase: any, allowedRoles: readonly string[]) {
    const user = await requireAuthenticatedUser(supabase);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (error || !profile || !allowedRoles.includes(profile.role)) {
        throw new Error('Forbidden');
    }

    return { user, role: profile.role };
}
