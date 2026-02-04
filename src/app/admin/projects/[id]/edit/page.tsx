'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Save, User as UserIcon, Building2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function EditProjectPage() {
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    // Catalogs
    const [procedures, setProcedures] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [manufacturers, setManufacturers] = useState<any[]>([]);

    // Form Data
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        procedure_id: '',
        start_date: '',
        due_date: '',
        supervisor_id: '',
        analyst_id: '',
        client_id: '',
        manufacturer_id: '',
        alert_days: 30
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setInitialLoading(true);
        try {
            // 1. Load Catalogs
            const { data: procs } = await supabase.from('procedures').select('*').eq('is_active', true);
            if (procs) setProcedures(procs);

            const { data: profiles } = await supabase.from('profiles').select('*').eq('is_active', true);
            if (profiles) setUsers(profiles);

            const { data: comps } = await supabase.from('companies').select('*').eq('type', 'CLIENT').eq('is_active', true);
            if (comps) setClients(comps);

            const { data: manu } = await supabase.from('companies').select('*').eq('type', 'MANUFACTURER').eq('is_active', true);
            if (manu) setManufacturers(manu);

            // 2. Load Project Data
            const { data: project, error } = await supabase
                .from('projects')
                .select(`
                    *,
                    members:project_members(user_id, role)
                `)
                .eq('id', projectId)
                .single();

            if (error || !project) throw new Error('Project not found');

            // 3. Map to Form
            const supervisor = project.members?.find((m: any) => m.role === 'SUPERVISOR')?.user_id || '';
            const analyst = project.members?.find((m: any) => m.role === 'ANALYST')?.user_id || '';

            setFormData({
                name: project.name,
                description: project.description || '',
                procedure_id: project.procedure_id,
                start_date: project.start_date || '',
                due_date: project.due_date || '',
                client_id: project.client_id || '',
                manufacturer_id: project.manufacturer_id || '',
                supervisor_id: supervisor,
                analyst_id: analyst,
                alert_days: project.alert_days || 30
            });

        } catch (error) {
            console.error(error);
            alert('Error cargando datos');
            router.push('/admin/projects');
        } finally {
            setInitialLoading(false);
        }
    };

    const handleUpdate = async () => {
        setLoading(true);
        try {
            // 1. Update Project Basic Info
            const { error: updateError } = await supabase
                .from('projects')
                .update({
                    name: formData.name,
                    description: formData.description,
                    procedure_id: formData.procedure_id, // Usually changing this is risky, but allowed for now
                    client_id: formData.client_id,
                    manufacturer_id: formData.manufacturer_id || null,
                    start_date: formData.start_date || null,
                    due_date: formData.due_date || null,
                    alert_days: formData.alert_days,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId);

            if (updateError) throw updateError;

            // 2. Update Members (This is tricky, simplistic approach: delete and re-insert or upsert)
            // Safer: Upsert logic or separate calls.
            // Let's do simple: Check existing, update if changed.

            // Helper to upsert member
            const upsertMember = async (userId: string, role: string) => {
                if (!userId) return; // If empty, maybe we should delete? (Not implemented for safety)

                // Check if this role exists
                const { data: existing } = await supabase
                    .from('project_members')
                    .select('*')
                    .eq('project_id', projectId)
                    .eq('role', role)
                    .single();

                if (existing) {
                    if (existing.user_id !== userId) {
                        // Update user for this role
                        await supabase.from('project_members').update({ user_id: userId }).eq('id', existing.id);
                    }
                } else {
                    // Insert new
                    await supabase.from('project_members').insert({ project_id: projectId, user_id: userId, role });
                }
            };

            await upsertMember(formData.supervisor_id, 'SUPERVISOR');
            if (formData.analyst_id) {
                await upsertMember(formData.analyst_id, 'ANALYST');
            }

            // Note: We are not handling "Removing Analyst" here (setting to empty) to keep it simple, 
            // but usually you'd want to delete the record if formData.analyst_id is empty.
            if (!formData.analyst_id) {
                await supabase
                    .from('project_members')
                    .delete()
                    .eq('project_id', projectId)
                    .eq('role', 'ANALYST');
            }

            alert('Proyecto actualizado correctamente');
            router.push('/admin/projects');

        } catch (error: any) {
            console.error(error);
            alert('Error al actualizar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return <div className="p-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /></div>;
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/projects">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Editar Proyecto</h1>
                    <p className="text-neutral-500">Modificar detalles generales y asignaciones.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Save className="h-5 w-5 text-blue-600" />
                        Datos del Expediente
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* General Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Nombre del Proyecto / Expediente</Label>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        {/* Client Selection */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-neutral-500" /> Cliente
                            </Label>
                            <Select
                                value={formData.client_id}
                                onValueChange={v => setFormData({ ...formData, client_id: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el Cliente..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {clients.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Manufacturer Selection */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-neutral-500" /> Fabricante
                            </Label>
                            <Select
                                value={formData.manufacturer_id}
                                onValueChange={v => setFormData({ ...formData, manufacturer_id: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el Fabricante..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {manufacturers.map(m => (
                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label>Trámite Base (No recomendable cambiar)</Label>
                            <Select
                                value={formData.procedure_id}
                                onValueChange={v => setFormData({ ...formData, procedure_id: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona el trámite..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {procedures.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label>Descripción / Notas</Label>
                            <Textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha Inicio</Label>
                            <Input
                                type="date"
                                value={formData.start_date}
                                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha Vencimiento (Deadline)</Label>
                            <Input
                                type="date"
                                value={formData.due_date}
                                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Días Alerta (Default 30)</Label>
                            <Input
                                type="number"
                                value={formData.alert_days}
                                onChange={e => setFormData({ ...formData, alert_days: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    <div className="border-t pt-4 mt-2">
                        <Label className="text-lg font-semibold mb-4 block">Asignación de Equipo</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <UserIcon className="h-4 w-4 text-emerald-600" /> Supervisor Responsable
                                </Label>
                                <Select
                                    value={formData.supervisor_id}
                                    onValueChange={v => setFormData({ ...formData, supervisor_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.filter(u => ['ADMIN', 'SUPERVISOR', 'DIRECTOR'].includes(u.role)).map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.full_name || u.email} ({u.role})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <UserIcon className="h-4 w-4 text-blue-600" /> Analista Asignado
                                </Label>
                                <Select
                                    value={formData.analyst_id}
                                    onValueChange={v => setFormData({ ...formData, analyst_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.filter(u => ['ANALYST'].includes(u.role)).map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.full_name || u.email} ({u.role})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            onClick={() => router.push('/admin/projects')}
                            disabled={loading}
                            className="w-full"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleUpdate}
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
