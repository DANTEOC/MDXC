'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        // Check if we have a session (link clicked)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                setError("Enlace inválido o expirado. Por favor solicita uno nuevo.");
            }
        });
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setMessage('Contraseña actualizada correctamente. Redirigiendo...');
            setTimeout(() => {
                router.push('/dashboard');
            }, 2000);
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
                            Nueva Contraseña
                        </CardTitle>
                        <CardDescription className="text-center">
                            Ingresa tu nueva contraseña segura.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">Nueva Contraseña</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
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

                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading || !!error}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Actualizar Contraseña
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
