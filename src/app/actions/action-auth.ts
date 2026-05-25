export const VAULT_WRITE_ROLES = ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] as const;
export const VAULT_VALIDATE_ROLES = ['ADMIN', 'DIRECTOR', 'SUPERVISOR', 'ANALYST'] as const;

type QueryResult<T> = Promise<{ data: T | null; error: unknown | null }>;

type QueryBuilder = {
    select(columns: string): QueryBuilder;
    eq(column: string, value: string): QueryBuilder;
    single<T = Record<string, unknown>>(): QueryResult<T>;
    maybeSingle<T = Record<string, unknown>>(): QueryResult<T>;
};

type SupabaseClient = {
    auth: {
        getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown | null }>;
    };
    from(table: string): QueryBuilder;
};

type AuthContext = {
    user: { id: string };
    role: string | null;
};

export async function requireAuthenticatedUser(supabase: SupabaseClient): Promise<AuthContext> {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('Unauthorized');
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single<{ role: string | null; status: string | null }>();

    if (profileError || !profile) {
        throw new Error('Unauthorized');
    }

    if (profile.status === 'SUSPENDED') {
        throw new Error('Unauthorized');
    }

    return { user, role: profile.role ?? null };
}

export async function requireProjectAccess(supabase: SupabaseClient, projectId: string): Promise<AuthContext> {
    const context = await requireAuthenticatedUser(supabase);

    if (context.role && VAULT_WRITE_ROLES.includes(context.role as (typeof VAULT_WRITE_ROLES)[number])) {
        return context;
    }

    const { data: membership, error } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', context.user.id)
        .maybeSingle<{ id: string }>();

    if (error || !membership) {
        throw new Error('Forbidden');
    }

    return context;
}

export async function requireProjectRole(
    supabase: SupabaseClient,
    projectId: string,
    allowedRoles: readonly string[]
): Promise<AuthContext> {
    const context = await requireProjectAccess(supabase, projectId);

    if (!context.role || !allowedRoles.includes(context.role)) {
        throw new Error('Forbidden');
    }

    return context;
}
