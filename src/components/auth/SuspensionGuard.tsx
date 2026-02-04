'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, usePathname } from 'next/navigation';

export function SuspensionGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    // Public paths that don't need status check
    const publicPaths = ['/login', '/auth', '/forgot-password'];
    const isPublic = publicPaths.some(p => pathname?.startsWith(p));

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        if (isPublic) return;

        async function checkStatus() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // Middleware or AuthGuard will handle this

            const { data: profile } = await supabase
                .from('profiles')
                .select('status')
                .eq('id', user.id)
                .single();

            if (profile && profile.status === 'SUSPENDED') {
                await supabase.auth.signOut();
                router.push('/login?error=Cuenta Suspendida. Contacte al Administrador.');
            }
        }

        checkStatus();
    }, [pathname]); // Re-check on route change

    return <>{children}</>;
}
