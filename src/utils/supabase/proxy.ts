import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request,
    });

    const redirectWithSessionCookies = (url: URL) => {
        const redirectResponse = NextResponse.redirect(url);
        response.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie);
        });
        return redirectResponse;
    };

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                    response = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Important: getUser() will automatically refresh the session if it's expired
    // but only if a refresh token is available in cookies.
    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    // If there's an error with the refresh token, it's usually because it's stale/invalid.
    // In dev, this is common when the database is reset.
    if (error && error.name === 'AuthApiError' && error.message.includes('Refresh Token Not Found')) {
        // We can ignore this error safely as 'user' will be null and the logic below will handle it.
    }

    // PROTECTED ROUTES LOGIC
    // 1. If no user and trying to access protected routes, redirect to login
    if (!user && (request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/admin'))) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return redirectWithSessionCookies(url);
    }

    // 2. If user exists and tries to access auth pages, redirect to dashboard
    if (user && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname === '/')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return redirectWithSessionCookies(url);
    }

    return response;
}
