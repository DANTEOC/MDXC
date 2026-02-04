'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isMounted, setIsMounted] = useState(false);

    // Determine if we are on an Auth page (Login, Forgot Pwd, etc)
    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/auth');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        setIsMounted(true);
        if (isAuthPage) return; // Don't check suspension on login page

        async function checkStatus() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('status')
                .eq('id', user.id)
                .single();

            if (profile && profile.status === 'SUSPENDED') {
                await supabase.auth.signOut();
                router.push('/login?error=Cuenta Suspendida');
            }
        }

        checkStatus();
    }, [pathname, isAuthPage]);

    if (!isMounted) return null; // Prevent hydration mismatch

    return (
        <>
            {/* Sidebar only if NOT auth page */}
            {!isAuthPage && (
                <aside className="fixed inset-y-0 left-0 z-50 hidden md:block w-64 shadow-xl">
                    <Sidebar />
                </aside>
            )}

            {/* Main Content Area */}
            <main className={cn(
                "flex-1 h-screen overflow-y-auto relative transition-all duration-300",
                !isAuthPage ? "md:ml-64 p-8" : "w-full p-0 flex items-center justify-center bg-neutral-100"
            )}>
                <div className={cn(
                    "mx-auto",
                    !isAuthPage ? "max-w-7xl bg-white rounded-2xl shadow-sm min-h-[calc(100vh-4rem)] p-8 border border-neutral-100" : "w-full"
                )}>
                    {children}
                </div>
            </main>
        </>
    );
}
