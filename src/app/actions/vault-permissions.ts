const VAULT_MANAGER_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'DIRECTOR']);

export async function requireVaultManager(supabase: any) {
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
