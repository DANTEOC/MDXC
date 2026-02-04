'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Plus, Search, Calendar, Building2, Flame, LayoutDashboard, FileText, CheckCircle2, Clock, AlertCircle, MoreVertical, Edit, Trash, Briefcase } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ProjectsListPage() {
    const [projects, setProjects] = useState<any[]>([]);
    const [taskStats, setTaskStats] = useState({ total: 0, pending: 0, active: 0, validated: 0 });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);

        // Parallel Fetch: Projects & Task Stats
        const [projRes, tasksRes] = await Promise.all([
            supabase.from('projects')
                .select(`*, procedure:procedures(name), client:companies!client_id(name), manufacturer:companies!manufacturer_id(name), documents:project_documents(expiry_date)`)
                .order('created_at', { ascending: false }),
            supabase.from('project_tasks').select('status')
        ]);

        if (projRes.data) setProjects(projRes.data);

        if (tasksRes.data) {
            const t = tasksRes.data;
            setTaskStats({
                total: t.length,
                pending: t.filter(x => x.status === 'PENDING').length,
                active: t.filter(x => ['UPLOADED', 'REQUESTED', 'IN_REVIEW', 'REVIEW_NEEDED'].includes(x.status)).length,
                validated: t.filter(x => x.status === 'VALIDATED').length
            });
        }

        setLoading(false);
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm('¿Estás seguro de eliminar este proyecto? SE BORRARÁ TODO EL EXPEDIENTE Y DOCUMENTOS.\n\nEsta acción no se puede deshacer.')) return;

        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) {
            alert('Error al eliminar: ' + error.message);
        } else {
            loadData();
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-neutral-100 text-neutral-600 border-neutral-200';
            case 'ACTIVE': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'COMPLETED': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'BLOCKED': return 'bg-red-100 text-red-700 border-red-200';
            case 'SUSPENDED': return 'bg-amber-50 text-amber-700 border-amber-200';
            default: return 'bg-neutral-100 text-neutral-600';
        }
    };

    const translateStatus = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'Borrador';
            case 'ACTIVE': return 'Activo';
            case 'COMPLETED': return 'Completado';
            case 'BLOCKED': return 'Bloqueado';
            case 'SUSPENDED': return 'Suspendido';
            default: return status;
        }
    };

    const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.procedure?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculated Project Stats
    const projStats = {
        total: projects.length,
        active: projects.filter(p => p.status === 'ACTIVE').length,
        completed: projects.filter(p => p.status === 'COMPLETED').length,
        cancelled: projects.filter(p => ['CANCELLED', 'REJECTED', 'BLOCKED'].includes(p.status)).length
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">

            {/* Header & Actions */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <LayoutDashboard className="h-6 w-6 text-neutral-700" />
                        Panel de Control Proyectos
                    </h1>
                    <p className="text-neutral-500 mt-1">Visión global de trámites y carga de trabajo.</p>
                </div>
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700 gap-2 shadow-sm">
                    <Link href="/admin/projects/new">
                        <Plus className="h-4 w-4" /> Nuevo Proyecto
                    </Link>
                </Button>
            </div>

            {/* Global Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Projects Card */}
                <Card className="bg-white border-neutral-200 shadow-sm hover:border-emerald-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-neutral-500 flex items-center justify-between">
                            Proyectos Activos
                            <FolderKanban className="h-4 w-4 text-emerald-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-700">{projStats.active}</div>
                        <p className="text-xs text-neutral-400 mt-1">de {projStats.total} totales</p>
                    </CardContent>
                </Card>

                {/* Documents Pending */}
                <Card className="bg-white border-neutral-200 shadow-sm hover:border-amber-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-neutral-500 flex items-center justify-between">
                            Docs. Pendientes
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{taskStats.pending}</div>
                        <p className="text-xs text-neutral-400 mt-1">Solicitudes por subir</p>
                    </CardContent>
                </Card>

                {/* Documents In Review */}
                <Card className="bg-white border-neutral-200 shadow-sm hover:border-blue-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-neutral-500 flex items-center justify-between">
                            En Revisión
                            <Clock className="h-4 w-4 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{taskStats.active}</div>
                        <p className="text-xs text-neutral-400 mt-1">Archivos subidos / revisando</p>
                    </CardContent>
                </Card>

                {/* Documents Validated */}
                <Card className="bg-white border-neutral-200 shadow-sm hover:border-violet-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-neutral-500 flex items-center justify-between">
                            Docs. Validados
                            <CheckCircle2 className="h-4 w-4 text-violet-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-violet-700">{taskStats.validated}</div>
                        <p className="text-xs text-neutral-400 mt-1">Expedientes completos</p>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
                        <FolderKanban className="h-5 w-5 text-neutral-500" />
                        Listado de Proyectos
                    </h2>
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            placeholder="Buscar proyecto..."
                            className="pl-9 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {loading ? (
                        <div className="text-center py-20 text-neutral-400">Cargando datos...</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-20 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                            <Briefcase className="h-10 w-10 text-neutral-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-neutral-600">No hay proyectos encontrados</h3>
                            <p className="text-sm text-neutral-400 mb-6">Intenta con otros términos de búsqueda o crea uno nuevo.</p>
                            <Button asChild variant="outline">
                                <Link href="/admin/projects/new">Crear Proyecto</Link>
                            </Button>
                        </div>
                    ) : (
                        filtered.map((proj) => {
                            const daysDiff = proj.due_date ? differenceInDays(new Date(proj.due_date), new Date()) : null;
                            const alertDays = proj.alert_days || 30;
                            const alertCount = proj.documents?.filter((d: any) => {
                                if (!d.expiry_date) return false;
                                const days = differenceInDays(new Date(d.expiry_date), new Date());
                                return days <= alertDays;
                            }).length || 0;

                            return (
                                <Link key={proj.id} href={`/admin/projects/${proj.id}`} className="block relative group">
                                    <div
                                        className="p-6 rounded-xl border border-neutral-200 bg-white hover:border-emerald-400 hover:shadow-md transition-all flex flex-col md:flex-row gap-6 justify-between pr-12"
                                    >
                                        <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-neutral-600" onClick={(e) => e.preventDefault()}>
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/admin/projects/${proj.id}/edit`} className="cursor-pointer gap-2 flex items-center">
                                                            <Edit className="h-4 w-4" /> Editar
                                                        </Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-red-600 cursor-pointer gap-2 focus:text-red-600 focus:bg-red-50"
                                                        onClick={(e) => handleDelete(proj.id, e)}
                                                    >
                                                        <Trash className="h-4 w-4" /> Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className={getStatusColor(proj.status)}>
                                                    {translateStatus(proj.status)}
                                                </Badge>
                                                <span className="text-xs text-neutral-400 font-mono">{proj.procedure?.name || 'Trámite'}</span>
                                            </div>
                                            <h3 className="text-lg font-medium text-neutral-900 group-hover:text-emerald-700 transition-colors">
                                                {proj.name}
                                            </h3>

                                            <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-neutral-400" />
                                                    <span>{proj.client?.name || 'N/A'}</span>
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
                                            <div className="flex flex-col items-end text-sm text-neutral-500 gap-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>Actualizado: {format(new Date(proj.updated_at || proj.created_at), "d MMM yyyy", { locale: es })}</span>
                                                </div>

                                                <div className={`flex items-center gap-2 border rounded-md p-2 shadow-sm mb-1 ${alertCount > 0
                                                    ? 'bg-red-50 border-red-200'
                                                    : 'bg-emerald-50 border-emerald-200'
                                                    }`}>
                                                    <div className={`flex items-center gap-1.5 font-bold text-xs ${alertCount > 0 ? 'text-red-700' : 'text-emerald-700'
                                                        }`}>
                                                        {alertCount > 0
                                                            ? <Flame className="h-4 w-4 fill-red-500 animate-pulse" />
                                                            : <Calendar className="h-4 w-4 text-emerald-500" />
                                                        }
                                                        <span>Alertas de Vencimiento:</span>
                                                    </div>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shadow-sm ${alertCount > 0
                                                        ? 'bg-white text-red-800 border-red-100'
                                                        : 'bg-white text-emerald-800 border-emerald-100'
                                                        }`}>
                                                        {alertCount}
                                                    </span>
                                                </div>

                                                {proj.due_date && daysDiff !== null && (
                                                    <div className={`flex items-center gap-1 font-medium ${daysDiff < 0 ? 'text-neutral-500' :
                                                        daysDiff <= 3 ? 'text-amber-600' :
                                                            'text-neutral-500'
                                                        }`}>
                                                        <span>
                                                            {daysDiff < 0 ? 'Entrega vencida: ' : 'Entrega: '}
                                                            {format(new Date(proj.due_date), 'dd MMM', { locale: es })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Progreso Global</span>
                                                <div className="w-32 h-1.5 bg-neutral-100 rounded-full overflow-hidden" title="Progreso estimado basado en tareas">
                                                    <div className="h-full bg-emerald-500 w-1/3"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
