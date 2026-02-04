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
import { Loader2, Plus, Search, Trash2, Edit, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export default function ClientsPage() {
    const router = useRouter();
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State for Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '', // Razón Social
        commercial_name: '',
        tax_id: '',
        address: '',
        contact_name: '',
        email: '',
        phone: '',
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
            .eq('type', 'CLIENT')
            .order('name');

        if (data) setClients(data);
        setLoading(false);
    };

    const handleEdit = (cl: any) => {
        setEditingId(cl.id);
        setFormData({
            name: cl.name,
            commercial_name: cl.commercial_name || '',
            tax_id: cl.tax_id || '',
            address: cl.address || '',
            contact_name: cl.contact_info?.contact_name || '',
            email: cl.contact_info?.email || '',
            phone: cl.contact_info?.phone || '',
            is_active: cl.is_active
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            name: '', commercial_name: '', tax_id: '', address: '',
            contact_name: '', email: '', phone: '', is_active: true
        });
    };

    const handleSubmit = async () => {
        if (!formData.name) return alert('La Razón Social es obligatoria');
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            commercial_name: formData.commercial_name,
            tax_id: formData.tax_id,
            address: formData.address,
            type: 'CLIENT',
            is_active: formData.is_active,
            contact_info: {
                contact_name: formData.contact_name,
                email: formData.email,
                phone: formData.phone
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
        const newStatus = !currentStatus;
        const { error } = await supabase
            .from('companies')
            .update({ is_active: newStatus })
            .eq('id', id);

        if (error) alert('Error actualizando estatus');
        else loadData();
    };

    const filtered = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.commercial_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.tax_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-neutral-600" />
                        Clientes
                    </h1>
                    <p className="text-neutral-500">Gestión de cartera de clientes.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Razón Social (Obligatorio)</Label>
                                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ej. ACME S.A. de C.V." />
                            </div>
                            <div className="space-y-2">
                                <Label>Nombre Comercial</Label>
                                <Input value={formData.commercial_name} onChange={e => setFormData({ ...formData, commercial_name: e.target.value })} placeholder="Ej. Industrias ACME" />
                            </div>
                            <div className="space-y-2">
                                <Label>RFC (Tax ID)</Label>
                                <Input value={formData.tax_id} onChange={e => setFormData({ ...formData, tax_id: e.target.value })} />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Dirección Fiscal</Label>
                                <Textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} rows={2} />
                            </div>

                            <div className="col-span-2 border-t pt-4 mt-2">
                                <Label className="text-neutral-500 mb-2 block">Datos de Contacto Administrativo</Label>
                            </div>

                            <div className="space-y-2">
                                <Label>Nombre Contacto</Label>
                                <Input value={formData.contact_name} onChange={e => setFormData({ ...formData, contact_name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Teléfono</Label>
                                <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                            </div>

                            <div className="flex items-center gap-2 pt-8">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={c => setFormData({ ...formData, is_active: c })}
                                />
                                <Label>Cliente Activo</Label>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-emerald-600">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? 'Guardar Cambios' : 'Crear Cliente'}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="py-3 px-4 border-b bg-neutral-50/50">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            placeholder="Buscar por nombre, RFC..."
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
                                <TableHead>Empresa</TableHead>
                                <TableHead>RFC</TableHead>
                                <TableHead>Contacto</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={5} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium text-neutral-900">{item.name}</div>
                                        {item.commercial_name && <div className="text-xs text-neutral-500">{item.commercial_name}</div>}
                                    </TableCell>
                                    <TableCell className="text-sm font-mono text-neutral-600">
                                        {item.tax_id || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                        {item.contact_info?.contact_name && <div className="font-medium">{item.contact_info.contact_name}</div>}
                                        {item.contact_info?.email && <div className="text-xs">{item.contact_info.email}</div>}
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
