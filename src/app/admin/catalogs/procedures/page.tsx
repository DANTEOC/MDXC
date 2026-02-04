'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Search, Edit, Workflow, Settings2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

export default function ProceduresCatalogPage() {
    const router = useRouter();
    const [procedures, setProcedures] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // State for Dialog
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
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
            .from('procedures')
            .select('*')
            .order('name');

        if (data) setProcedures(data);
        setLoading(false);
    };

    const handleEdit = (proc: any) => {
        setEditingId(proc.id);
        setFormData({
            name: proc.name,
            description: proc.description || '',
            is_active: proc.is_active
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            name: '', description: '', is_active: true
        });
    };

    const handleSubmit = async () => {
        if (!formData.name) return alert('El Nombre es obligatorio');
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            description: formData.description,
            is_active: formData.is_active
        };

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('procedures')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('procedures')
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
        const { error } = await supabase
            .from('procedures')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (!error) loadData();
    };

    const filtered = procedures.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase())
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
                        <Workflow className="h-6 w-6 text-emerald-600" />
                        Catálogo de Trámites
                    </h1>
                    <p className="text-neutral-500">Define los trámites y sus documentos requeridos (Input/Output).</p>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                    <Input
                        placeholder="Buscar trámite..."
                        className="pl-9 w-full md:w-[300px] bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Trámite
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Editar Trámite' : 'Nuevo Trámite'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-1 gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre del Trámite</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej. Alta de Placas, Beca Escolar"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    placeholder="Detalles sobre este trámite..."
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={c => setFormData({ ...formData, is_active: c })}
                                />
                                <Label>Trámite Activo</Label>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-emerald-600">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? 'Guardar Cambios' : 'Crear Trámite'}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Trámite</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead className="text-right">Configuración</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={4} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium text-lg">{item.name}</div>
                                        <div className="text-sm text-neutral-500 truncate max-w-[400px]">{item.description}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`
                                            ${item.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-100'}
                                        `}>
                                            {item.is_active ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link href={`/admin/catalogs/procedures/${item.id}`}>
                                            <Button size="sm" variant="secondary" className="gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                                                <Settings2 className="h-3 w-3" /> Configurar Documentos
                                            </Button>
                                        </Link>
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
