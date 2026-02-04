'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Plus, Briefcase, Calendar, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function loadProjects() {
            // Get Current User Role
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (profile) setCurrentUserRole(profile.role);
            }

            const { data } = await supabase
                .from('projects')
                .select(`
          *,
          client:companies!client_id(name),
          manufacturer:companies!manufacturer_id(name)
        `)
                .order('updated_at', { ascending: false });

            if (data) setProjects(data);
            setLoading(false);
        }
        loadProjects();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'DRAFT': return 'bg-neutral-100 text-neutral-600 border-neutral-200';
            case 'SUSPENDED': return 'bg-amber-50 text-amber-700 border-amber-200';
            default: return 'bg-neutral-100 text-neutral-600';
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-800">
                        Proyectos (Trámites)
                    </h1>
                    <p className="text-sm text-neutral-500">
                        Gestiona los procesos de importación y control documental.
                    </p>
                </div>
                {['ADMIN', 'SUPERVISOR'].includes(currentUserRole || '') && (
                    <Button asChild className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                        <Link href="/admin/projects/new">
                            <Plus className="h-4 w-4" /> Nuevo Proyecto
                        </Link>
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div>Cargando proyectos...</div>
                ) : projects.length === 0 ? (
                    <div className="text-center py-20 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                        <Briefcase className="h-10 w-10 text-neutral-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-neutral-600">No hay proyectos activos</h3>
                        <p className="text-sm text-neutral-400 mb-6">Comienza creando el primer trámite para un cliente.</p>
                        <Button asChild variant="outline">
                            <Link href="/admin/projects/new">Crear Proyecto</Link>
                        </Button>
                    </div>
                ) : (
                    projects.map((proj) => (
                        <Link key={proj.id} href={`/projects/${proj.id}`} className="block">
                            <div
                                className="p-6 rounded-xl border border-neutral-200 bg-white hover:border-emerald-400 hover:shadow-md transition-all flex flex-col md:flex-row gap-6 justify-between group"
                            >
                                <div className="space-y-3 flex-1">
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={getStatusColor(proj.status)}>
                                            {proj.status}
                                        </Badge>
                                        <span className="text-xs text-neutral-400 font-mono">{proj.id.slice(0, 8)}</span>
                                    </div>
                                    <h3 className="text-lg font-medium text-neutral-900 group-hover:text-emerald-700 transition-colors">
                                        {proj.name}
                                    </h3>

                                    <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-neutral-400" />
                                            <span>{proj.client?.name}</span>
                                        </div>
                                        {proj.manufacturer && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-neutral-300">|</span>
                                                <span>Fab: {proj.manufacturer.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end justify-between gap-4">
                                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                                        <Calendar className="h-3 w-3" />
                                        Actualizado: {format(new Date(proj.updated_at), "d MMM yyyy", { locale: es })}
                                    </div>
                                    {/* Progress Bar Placeholder */}
                                    <div className="w-32 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 w-1/3"></div>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
