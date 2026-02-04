'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Wand2, Save, User as UserIcon, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewProjectPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

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
        manufacturer_id: ''
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadCatalogs();
    }, []);

    const loadCatalogs = async () => {
        // Load Procedures
        const { data: procs } = await supabase.from('procedures').select('*').eq('is_active', true);
        if (procs) setProcedures(procs);

        // Load Users (Profiles)
        const { data: profiles } = await supabase.from('profiles').select('*').eq('is_active', true);
        if (profiles) setUsers(profiles);

        // Load Clients
        const { data: comps } = await supabase.from('companies').select('*').eq('type', 'CLIENT').eq('is_active', true);
        if (comps) setClients(comps);

        // Load Manufacturers
        const { data: manu } = await supabase.from('companies').select('*').eq('type', 'MANUFACTURER').eq('is_active', true);
        if (manu) setManufacturers(manu);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.procedure_id || !formData.supervisor_id || !formData.client_id) {
            return alert('Nombre, Trámite, Cliente y Supervisor son obligatorios.');
        }
        setLoading(true);

        try {
            // 1. Create Project
            const { data: project, error: projError } = await supabase.from('projects').insert({
                name: formData.name,
                description: formData.description,
                procedure_id: formData.procedure_id,
                client_id: formData.client_id, // Insert Client ID
                manufacturer_id: formData.manufacturer_id || null, // Insert Manufacturer ID
                start_date: formData.start_date || null,
                due_date: formData.due_date || null,
                status: 'ACTIVE' // Start active for now
            }).select().single();

            if (projError) throw projError;
            if (!project) throw new Error('Failed to create project');
            const projectId = project.id;

            // 2. Add Members
            const membersPayload = [];
            // Supervisor
            membersPayload.push({
                project_id: projectId, user_id: formData.supervisor_id, role: 'SUPERVISOR'
            });
            // Analyst (Optional)
            if (formData.analyst_id) {
                membersPayload.push({
                    project_id: projectId, user_id: formData.analyst_id, role: 'ANALYST'
                });
            }

            const { data: insertedMembers, error: membersError } = await supabase
                .from('project_members')
                .insert(membersPayload)
                .select(); // Select to get IDs if needed for assignment

            if (membersError) throw membersError;

            // 3. Auto-Generate Tasks (MAGIC STEP) 🪄
            // Fetch requirements from Procedure
            const { data: requirements } = await supabase
                .from('procedure_documents')
                .select('*')
                .eq('procedure_id', formData.procedure_id);

            if (requirements && requirements.length > 0) {
                // 3a. Create Placeholders in project_documents (For Alerts/Storage)
                const docsPayload = requirements.map(req => ({
                    project_id: projectId,
                    document_definition_id: req.document_definition_id,
                    status: 'MISSING',
                    created_at: new Date().toISOString()
                }));
                const { error: docsError } = await supabase.from('project_documents').insert(docsPayload);
                if (docsError) throw docsError;

                // 3b. Create Tasks (For Workflow)
                const tasksPayload = requirements.map(req => ({
                    project_id: projectId,
                    document_definition_id: req.document_definition_id,
                    procedure_document_id: req.id,
                    status: 'PENDING',
                    // Assign to Analyst by default if available, else null?
                    // Or assign to Supervisor? Let's leave unassigned for now or assigned to creator.
                }));

                const { error: tasksError } = await supabase.from('project_tasks').insert(tasksPayload);
                if (tasksError) throw tasksError;
            }

            // Success!
            router.push(`/admin/projects/${projectId}`); // Go to Dashboard (to be created)

        } catch (error: any) {
            console.error(error);
            alert('Error al crear proyecto: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/projects">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Nuevo Proyecto</h1>
                    <p className="text-neutral-500">Inicia un nuevo expediente basado en un Trámite.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-purple-600" />
                        Configuración Inicial
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* General Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Nombre del Proyecto / Expediente</Label>
                            <Input
                                placeholder="Ej. Renovación de Licencia - Patito S.A. de C.V."
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
                            <Label>Trámite Base (Receta)</Label>
                            <Select
                                value={formData.procedure_id}
                                onValueChange={v => {
                                    setFormData({ ...formData, procedure_id: v });
                                    // Optional: Auto-fill name if empty?
                                }}
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
                            <p className="text-[10px] text-neutral-500">
                                Esto definirá automáticamente los documentos requeridos.
                            </p>
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Descripción / Notas</Label>
                            <Textarea
                                placeholder="Detalles adicionales..."
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

                    <Button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6"
                    >
                        {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                        {loading ? 'Creando Proyecto...' : '✨ Generar Proyecto y Solicitudes'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
