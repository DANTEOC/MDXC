const VAULT_MANAGER_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'DIRECTOR']);

type SupabaseUser = { id: string } & Record<string, unknown>;
type SupabaseError = { message?: string } | null;
type RoleProfile = { role: string };

interface VaultPermissionClient {
    auth: {
        getUser(): Promise<{ data: { user: SupabaseUser | null }; error: SupabaseError }>;
    };
    from(table: 'profiles'): {
        select(columns: 'role'): {
            eq(column: 'id', value: string): {
                single(): Promise<{ data: RoleProfile | null; error: SupabaseError }>;
            };
        };
    };
}

export async function requireVaultManager(supabase: VaultPermissionClient) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        throw new Error('Unauthorized');
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile || !VAULT_MANAGER_ROLES.has(profile.role)) {
        throw new Error('No tienes permisos para modificar la bóveda.');
    }

    return user;
}
