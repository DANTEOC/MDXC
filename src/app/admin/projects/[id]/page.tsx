'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar, User, Building2, CheckCircle2, Clock, AlertCircle, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { TaskDetailSheet } from '@/components/projects/TaskDetailSheet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ProjectDashboardPage() {
    const params = useParams();
    const [project, setProject] = useState<any>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    // New state for documents to track expiry
    const [documents, setDocuments] = useState<any[]>([]);

    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadProjectData();
    }, []);

    const loadProjectData = async () => {
        setLoading(true);
        const projectId = params.id;

        // 0. Get Current User Role
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (profile) setCurrentUserRole(profile.role);
        }

        // 1. Fetch Project Details
        const { data: proj } = await supabase
            .from('projects')
            .select(`
                *,
                procedure:procedures(name),
                client:companies!client_id(name),
                manufacturer:companies!manufacturer_id(name)
            `)
            .eq('id', projectId)
            .single();

        if (proj) setProject(proj);

        // 2. Fetch Tasks with Assigned Member Role
        const { data: t } = await supabase
            .from('project_tasks')
            .select(`
                *,
                definition:document_definitions(name, description, fields:field_definitions(sensitivity)),
                assigned_member:assigned_to(role, profile:user_id(full_name))
            `)
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (t) setTasks(t);

        // 3. Fetch Members & Profiles Manual Join
        const { data: m } = await supabase
            .from('project_members')
            .select('*')
            .eq('project_id', projectId);

        if (m && m.length > 0) {
            const userIds = m.map((member: any) => member.user_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, email, role')
                .in('id', userIds);

            const merged = m.map((member: any) => ({
                ...member,
                profile: profiles?.find((p: any) => p.id === member.user_id)
            }));
            setMembers(merged);
        } else {
            setMembers([]);
        }

        // 4. Fetch Documents for Validity Alerts
        const { data: d } = await supabase
            .from('project_documents')
            .select('*')
            .eq('project_id', projectId);

        if (d) setDocuments(d);

        setLoading(false);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PENDING': return 'text-neutral-500 bg-neutral-100';
            case 'REQUESTED': return 'text-blue-600 bg-blue-100';
            case 'UPLOADED': return 'text-amber-600 bg-amber-100';
            case 'VALIDATED': return 'text-emerald-600 bg-emerald-100';
            case 'REJECTED': return 'text-red-600 bg-red-100';
            default: return 'bg-neutral-100';
        }
    };

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
    if (!project) return <div className="p-8">Proyecto no encontrado.</div>;

    // Logic Calculations
    const supervisor = members.find(m => m.role === 'SUPERVISOR');
    const analyst = members.find(m => m.role === 'ANALYST');

    const startDate = project.start_date ? new Date(project.start_date) : null;
    const dueDate = project.due_date ? new Date(project.due_date) : null;
    const today = new Date();

    const daysElapsed = startDate ? Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const daysRemaining = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // Document & Alert Stats
    const totalDocs = tasks.length;
    const finishedDocs = tasks.filter(t => t.status === 'VALIDATED').length;

    // Calculate Expiry Alerts (e.g., expired or expiring in < alertDays)
    const expiryAlerts = documents.filter(doc => {
        if (!doc.expiry_date) return false;
        const alertDays = project.alert_days || 30; // Dynamic or default 30
        const exp = new Date(doc.expiry_date);
        const daysToExpiry = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        // Alert if expired (days <= 0) or within alert window (days <= alertDays)
        return daysToExpiry <= alertDays;
    }).length;

    // Task Stats by Role
    const getTaskStats = (role: string) => {
        const roleTasks = tasks.filter(t => t.assigned_member?.role === role);
        return {
            total: roleTasks.length,
            done: roleTasks.filter(t => t.status === 'VALIDATED').length,
            inProgress: roleTasks.filter(t => ['UPLOADED', 'REQUESTED', 'IN_REVIEW'].includes(t.status)).length,
            pending: roleTasks.filter(t => t.status === 'PENDING').length
        };
    };

    const supStats = getTaskStats('SUPERVISOR');
    const analystStats = getTaskStats('ANALYST');

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
                    <div className="space-y-1">
                        <Link href="/admin/projects" className="text-sm text-neutral-500 hover:text-blue-600 flex items-center gap-1 mb-2">
                            <ArrowLeft className="h-3 w-3" /> Volver a Proyectos
                        </Link>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-neutral-900">{project.name}</h1>
                            <Badge className="bg-blue-600">{project.status}</Badge>
                        </div>
                        <p className="text-neutral-500 text-sm">{project.procedure?.name}</p>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex items-center gap-2">
                        {/* Only ADMIN or SUPERVISOR can generate documents */}
                        {['ADMIN', 'SUPERVISOR'].includes(currentUserRole || '') && (
                            <div className="flex gap-2">
                                <Link href={`/admin/projects/${project.id}/generate`}>
                                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                                        <FileText className="h-4 w-4" /> Generar Reporte
                                    </Button>
                                </Link>
                                <Link href={`/admin/projects/${project.id}/documents`}>
                                    <Button variant="outline" className="gap-2">
                                        <FileText className="h-4 w-4" /> Gestionar Expediente
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Staff & Dates Info Bar */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-white border rounded-lg shadow-sm">
                    <div className="space-y-1">
                        <div className="text-xs text-neutral-500 uppercase font-semibold">Supervisor</div>
                        <div className="flex items-center gap-2 font-medium text-neutral-800">
                            <User className="h-4 w-4 text-blue-600" />
                            {supervisor?.profile?.full_name || supervisor?.profile?.email || 'No asignado'}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs text-neutral-500 uppercase font-semibold">Analista</div>
                        <div className="flex items-center gap-2 font-medium text-neutral-800">
                            <User className="h-4 w-4 text-indigo-600" />
                            {analyst?.profile?.full_name || analyst?.profile?.email || 'No asignado'}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs text-neutral-500 uppercase font-semibold">Tiempo</div>
                        <div className="text-sm">
                            <span className="text-neutral-600">Inicio: </span>
                            <span className="font-medium">{project.start_date || 'N/A'}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-neutral-600">Entrega: </span>
                            <span className={`font-medium ${daysRemaining < 0 ? 'text-red-600' : 'text-neutral-800'}`}>
                                {project.due_date || 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs text-neutral-500 uppercase font-semibold">Progreso Tiempo</div>
                        <div className="flex justify-between text-sm">
                            <span>Transcurrido:</span>
                            <span className="font-bold">{daysElapsed > 0 ? daysElapsed : 0} días</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>Faltante:</span>
                            <span className={`font-bold ${daysRemaining < 3 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {daysRemaining} días
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Documents Stats */}
                    <Card className="bg-slate-50 border-slate-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Documentos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-slate-800">{String(finishedDocs).padStart(2, '0')} <span className="text-lg text-slate-400 font-normal">/ {totalDocs}</span></div>
                            <div className="text-xs text-slate-500 mt-1">Terminados vs Totales</div>
                        </CardContent>
                    </Card>

                    {/* Expiry Alerts - NEW */}
                    <Card className="bg-amber-50 border-amber-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" /> Alertas Vigencia
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-amber-900">{expiryAlerts}</div>
                            <div className="text-xs text-amber-700 mt-1">Documentos por vencer/vencidos</div>
                        </CardContent>
                    </Card>

                    {/* Supervisor Tasks */}
                    <Card className="bg-blue-50 border-blue-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
                                <User className="h-4 w-4" /> Tareas Supervisor
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-blue-700">Completadas</span>
                                <span className="font-bold text-blue-900">{supStats.done}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-blue-700">En Progreso</span>
                                <span className="font-bold text-blue-900">{supStats.inProgress}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-blue-700">Pendientes</span>
                                <span className="font-bold text-blue-900">{supStats.pending}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Analyst Tasks */}
                    <Card className="bg-indigo-50 border-indigo-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-indigo-600 flex items-center gap-2">
                                <User className="h-4 w-4" /> Tareas Analista
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-indigo-700">Completadas</span>
                                <span className="font-bold text-indigo-900">{analystStats.done}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-indigo-700">En Progreso</span>
                                <span className="font-bold text-indigo-900">{analystStats.inProgress}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-indigo-700">Pendientes</span>
                                <span className="font-bold text-indigo-900">{analystStats.pending}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="tasks" className="w-full">
                <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
                    <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 py-3 px-1">
                        Checklist de Tareas ({tasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="members" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 py-3 px-1">
                        Equipo Asignado ({members.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="mt-6 space-y-4">
                    {tasks.map(task => (
                        <Card key={task.id} className="hover:shadow-md transition-shadow group">
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${task.status === 'VALIDATED' ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
                                        <FileText className={`h-5 w-5 ${task.status === 'VALIDATED' ? 'text-emerald-600' : 'text-neutral-500'}`} />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-neutral-900">{task.definition?.name}</h4>
                                        <p className="text-sm text-neutral-500">{task.definition?.description || 'Sin descripción'}</p>
                                        {/* Display Assigned Role/Name on Task */}
                                        {task.assigned_member && (
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="secondary" className="text-[10px] h-5 px-1 bg-neutral-100 text-neutral-600">
                                                    {task.assigned_member.role === 'SUPERVISOR' ? 'Supervisor' : 'Analista'}
                                                </Badge>
                                                <span className="text-[10px] text-neutral-400">
                                                    {task.assigned_member.profile?.full_name || task.assigned_member.profile?.email || 'Sin nombre'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <Badge variant="outline" className={`${getStatusColor(task.status)} border-0 font-medium`}>
                                        {task.status === 'VALIDATED' ? 'Documento agregado' :
                                            task.status === 'PENDING' ? 'Pendiente' :
                                                task.status === 'REQUESTED' ? 'Solicitado' :
                                                    task.status === 'UPLOADED' ? 'En Revisión' :
                                                        task.status === 'REJECTED' ? 'Rechazado' : task.status}
                                    </Badge>

                                    {/* Task Management Sheet */}
                                    <TaskDetailSheet
                                        task={task}
                                        onUpdate={loadProjectData}
                                        userRole={currentUserRole}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {tasks.length === 0 && (
                        <div className="text-center py-10 text-neutral-500">
                            No hay tareas generadas para este proyecto.
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="members" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {members.map(member => (
                            <Card key={member.id}>
                                <CardContent className="p-4 flex items-center gap-3">
                                    <Avatar>
                                        <AvatarFallback>{member.profile?.full_name?.[0] || member.profile?.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{member.profile?.full_name || member.profile?.email}</p>
                                        <Badge variant="secondary" className="text-xs">{member.role}</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
