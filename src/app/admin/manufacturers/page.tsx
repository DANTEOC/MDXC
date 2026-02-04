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
import { Loader2, Plus, Search, Trash2, Edit, Factory } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

export default function ManufacturersPage() {
    const router = useRouter();
    const [manufacturers, setManufacturers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State for Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        website: '',
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
            .from('companies')
            .select('*')
            .eq('type', 'MANUFACTURER')
            .order('name');

        if (data) setManufacturers(data);
        setLoading(false);
    };

    const handleEdit = (mf: any) => {
        setEditingId(mf.id);
        setFormData({
            name: mf.name,
            email: mf.contact_info?.email || '',
            phone: mf.contact_info?.phone || '',
            website: mf.contact_info?.website || '',
            is_active: mf.is_active
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({ name: '', email: '', phone: '', website: '', is_active: true });
    };

    const handleSubmit = async () => {
        if (!formData.name) return alert('El nombre es obligatorio');
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            type: 'MANUFACTURER',
            is_active: formData.is_active,
            contact_info: {
                email: formData.email,
                phone: formData.phone,
                website: formData.website
            }
        };

        try {
            if (editingId) {
                // Update
                const { error } = await supabase
                    .from('companies')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                // Create
                const { error } = await supabase
                    .from('companies')
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

    const handleDelete = async (id: string, currentStatus: boolean) => {
        // Soft Delete (Toggle Active) instead of hard delete for safety
        // Or hard delete if truly unused? Let's stick to Soft Toggle for consistency with users
        // Actually, requirements said 'Delete'. Let's do a hard delete confirmation, or soft toggle. 
        // User requested "Delete (Soft Delete)" in plan.

        const newStatus = !currentStatus;
        const { error } = await supabase
            .from('companies')
            .update({ is_active: newStatus })
            .eq('id', id);

        if (error) alert('Error actualizando estatus');
        else loadData();
    };

    const filtered = manufacturers.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <Factory className="h-6 w-6 text-neutral-600" />
                        Fabricantes
                    </h1>
                    <p className="text-neutral-500">Gestión de marcas y proveedores.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Fabricante
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Editar Fabricante' : 'Nuevo Fabricante'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre de la Marca / Empresa</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email de Contacto</Label>
                                <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Teléfono</Label>
                                <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Sitio Web</Label>
                                <Input value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} />
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
                            {editingId ? 'Guardar Cambios' : 'Crear Fabricante'}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="py-3 px-4 border-b bg-neutral-50/50">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            placeholder="Buscar fabricante..."
                            className="pl-9 w-full md:w-[300px] bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Contacto</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={4} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                        {item.contact_info?.email && <div>{item.contact_info.email}</div>}
                                        {item.contact_info?.phone && <div>{item.contact_info.phone}</div>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`
                                            ${item.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-100'}
                                        `}>
                                            {item.is_active ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                                                <Edit className="h-4 w-4 text-neutral-500" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id, item.is_active)}>
                                                {item.is_active ? <Trash2 className="h-4 w-4 text-red-400" /> : <div className="text-xs text-emerald-600">Activar</div>}
                                            </Button>
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
