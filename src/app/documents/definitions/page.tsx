'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Plus, Shield, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function DocumentDefinitionsPage() {
    const [definitions, setDefinitions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function loadDefs() {
            const { data } = await supabase
                .from('document_definitions')
                .select(`
          *,
          fields:field_definitions(*)
        `)
                .order('name');

            if (data) setDefinitions(data);
            setLoading(false);
        }
        loadDefs();
    }, []);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-800">
                        Catálogo de Documentos
                    </h1>
                    <p className="text-sm text-neutral-500">
                        Consulta y configura las definiciones de documentos disponibles.
                    </p>
                </div>
                {/* Button removed as per user request (Read Only view) */}
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                    placeholder="Buscar documento..."
                    className="pl-9 bg-white border-neutral-200"
                />
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div>Cargando definiciones...</div>
                ) : (
                    definitions.map((def) => (
                        <div
                            key={def.id}
                            className="p-6 rounded-xl border border-neutral-200 bg-white hover:shadow-md transition-shadow flex flex-col md:flex-row gap-6 md:items-start justify-between"
                        >
                            <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-medium text-neutral-900">{def.name}</h3>
                                    {def.expiration_logic && (
                                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                            Vigencia Activa
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm text-neutral-500">{def.description || 'Sin descripción'}</p>

                                {/* Fields Preview */}
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {def.fields?.map((field: any) => (
                                        <Badge
                                            key={field.id}
                                            variant="secondary"
                                            className={`
                        gap-1.5 
                        ${field.sensitivity === 'CONFIDENTIAL' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 'bg-neutral-100 text-neutral-600'}
                      `}
                                        >
                                            {field.sensitivity === 'CONFIDENTIAL' && <Shield className="h-3 w-3" />}
                                            {field.name}
                                        </Badge>
                                    ))}
                                    <Link href={`/admin/catalogs/documents/${def.id}`}>
                                        <Button variant="ghost" size="sm" className="h-5 text-xs text-blue-600 px-2 rounded-full hover:bg-blue-50">
                                            + Agregar Campo
                                        </Button>
                                    </Link>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Link href={`/admin/catalogs/documents/${def.id}`}>
                                    <Button variant="outline" size="sm">Configurar</Button>
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
