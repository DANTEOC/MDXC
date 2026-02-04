'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${location.origin}/auth/reset-password`,
            });
            if (error) throw error;
            setMessage('Te hemos enviado un enlace de recuperación a tu correo.');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-neutral-100 p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="flex justify-center">
                    <img src="/logo.png" alt="MDXC Logo" className="h-20 w-auto object-contain" />
                </div>

                <Card className="w-full shadow-xl border-neutral-200">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold tracking-tight text-center text-neutral-900">
                            Recuperar Contraseña
                        </CardTitle>
                        <CardDescription className="text-center">
                            Ingresa tu correo y te enviaremos las instrucciones.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleReset} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="nombre@empresa.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {error && (
                                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
                                    {error}
                                </div>
                            )}

                            {message && (
                                <div className="p-3 text-sm text-emerald-600 bg-emerald-50 rounded-md border border-emerald-200">
                                    {message}
                                </div>
                            )}

                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enviar Enlace
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex justify-center">
                        <Link href="/login" className="flex items-center text-xs text-neutral-500 hover:text-neutral-900 transition-colors">
                            <ArrowLeft className="mr-1 h-3 w-3" />
                            Volver al Login
                        </Link>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
