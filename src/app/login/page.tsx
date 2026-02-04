'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                if (!firstName || !lastName) throw new Error('Nombre y Apellidos son requeridos');

                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${location.origin}/auth/callback`,
                        data: {
                            first_name: firstName,
                            last_name: lastName,
                            role: 'ANALYST' // Default role
                        }
                    },
                });
                if (error) throw error;
                setMessage('Revisa tu correo para confirmar tu cuenta.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                router.push('/dashboard');
            }
        } catch (err: any) {
            if (err.message && (err.message.includes('already registered') || err.message.includes('User already registered'))) {
                setIsSignUp(false);
                setMessage('Este correo ya está registrado. Por favor, inicia sesión.');
            } else {
                setError(err.message);
            }
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
                            {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
                        </CardTitle>
                        <CardDescription className="text-center">
                            {isSignUp
                                ? 'Ingresa tus datos para registrarte en MDXC'
                                : 'Bienvenido de nuevo al sistema MDXC'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAuth} className="space-y-4">
                            {isSignUp && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">Nombre</Label>
                                        <Input
                                            id="firstName"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            required={isSignUp}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Apellidos</Label>
                                        <Input
                                            id="lastName"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            required={isSignUp}
                                        />
                                    </div>
                                </div>
                            )}

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
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña</Label>
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

                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSignUp ? 'Registrarse' : 'Entrar'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <div className="text-sm text-neutral-500 text-center">
                            {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes acceso?'}
                            <button
                                onClick={() => setIsSignUp(!isSignUp)}
                                className="ml-1 text-emerald-600 hover:underline font-medium"
                            >
                                {isSignUp ? 'Inicia Sesión' : 'Regístrate'}
                            </button>
                        </div>
                        {!isSignUp && (
                            <Link href="/auth/forgot-password" className="text-xs text-neutral-400 hover:text-neutral-600 text-center">
                                ¿Olvidaste tu contraseña?
                            </Link>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
