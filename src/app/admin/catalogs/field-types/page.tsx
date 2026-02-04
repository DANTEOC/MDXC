'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Search, Edit, FileCode, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function FieldTypesPage() {
    const router = useRouter();
    const [types, setTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State for Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        key: '',
        description: '',
        is_active: true
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('catalog_field_types')
            .select('*')
            .order('name');

        if (data) setTypes(data);
        setLoading(false);
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setFormData({
            name: item.name,
            key: item.key,
            description: item.description || '',
            is_active: item.is_active
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({ name: '', key: '', description: '', is_active: true });
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.key) return alert('El Nombre y la Clave son obligatorios');
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            key: formData.key.toLowerCase().trim().replace(/\s+/g, '_'), // Normalize key
            description: formData.description,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
        };

        try {
            if (editingId) {
                // Update
                const { error } = await supabase
                    .from('catalog_field_types')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                // Create
                const { error } = await supabase
                    .from('catalog_field_types')
                    .insert([payload]);
                if (error) throw error;
            }

            setIsDialogOpen(false);
            resetForm();
            loadData();
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        const { error } = await supabase
            .from('catalog_field_types')
            .update({
                is_active: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) alert('Error actualizando estatus');
        else loadData();
    };

    const filtered = types.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.key.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/admin/catalogs">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <FileCode className="h-6 w-6 text-neutral-600" />
                        Tipos de Campos
                    </h1>
                    <p className="text-neutral-500">Define los tipos de datos disponibles para documentos.</p>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                    <Input
                        placeholder="Buscar tipo..."
                        className="pl-9 w-full md:w-[300px] bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Tipo
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Editar Tipo de Campo' : 'Nuevo Tipo de Campo'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej. Lista de Selección"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Clave (Identificador único)</Label>
                                <Input
                                    value={formData.key}
                                    onChange={e => setFormData({ ...formData, key: e.target.value })}
                                    placeholder="Ej. select"
                                    disabled={!!editingId} // Key usually shouldn't change
                                />
                                {editingId && <p className="text-xs text-amber-600">La clave no se puede modificar una vez creada.</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Breve descripción del uso de este campo..."
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={c => setFormData({ ...formData, is_active: c })}
                                />
                                <Label>Activo</Label>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-emerald-600">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? 'Guardar Cambios' : 'Crear Tipo'}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Clave</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead>Última Actualización</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={6} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="font-mono text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded w-fit">
                                        {item.key}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600 max-w-[300px] truncate" title={item.description}>
                                        {item.description || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`
                                            ${item.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-100'}
                                        `}>
                                            {item.is_active ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-neutral-500">
                                        {item.updated_at ? format(new Date(item.updated_at), "d MMM yy, HH:mm", { locale: es }) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                                                <Edit className="h-4 w-4 text-neutral-500" />
                                            </Button>
                                            <Switch
                                                checked={item.is_active}
                                                onCheckedChange={() => handleToggleStatus(item.id, item.is_active)}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
