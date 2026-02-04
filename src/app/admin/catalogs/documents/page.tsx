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
import { Loader2, Plus, Search, Edit, FileText, Settings2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Helper for key normalization
const normalizeKey = (text: string) => {
    return text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .trim()
        .replace(/\s+/g, '_'); // Spaces to underscores
};

export default function DocumentsCatalogPage() {
    const router = useRouter();
    const [documents, setDocuments] = useState<any[]>([]);
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
        is_active: true,
        origin: 'MDXC',
        classification: 'INTERNAL',
        language: 'ES',
        requires_translation: false,
        security_days: 0,
        alert_days: 30
    });

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    // Auto-generate key from name (only in creation mode)
    useEffect(() => {
        if (!editingId && formData.name) {
            setFormData(prev => ({ ...prev, key: normalizeKey(prev.name) }));
        }
    }, [formData.name, editingId]);

    const loadData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('document_definitions')
            .select('*')
            .order('name');

        if (data) setDocuments(data);
        setLoading(false);
    };

    const handleEdit = (doc: any) => {
        setEditingId(doc.id);
        setFormData({
            name: doc.name,
            key: doc.key || '',
            description: doc.description || '',
            is_active: doc.is_active,
            origin: doc.origin || 'MDXC',
            classification: doc.classification || 'INTERNAL',
            language: doc.language || 'ES',
            requires_translation: doc.requires_translation || false,
            security_days: doc.security_days || 0,
            alert_days: doc.alert_days || 30
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormData({
            name: '', key: '', description: '', is_active: true,
            origin: 'MDXC', classification: 'INTERNAL', language: 'ES',
            requires_translation: false, security_days: 0, alert_days: 30
        });
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.key) return alert('Nombre y Clave son obligatorios');
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            key: formData.key.toLowerCase().trim().replace(/\s+/g, '_'),
            description: formData.description,
            is_active: formData.is_active,
            origin: formData.origin,
            classification: formData.classification,
            language: formData.language,
            requires_translation: formData.requires_translation,
            security_days: formData.security_days,
            alert_days: formData.alert_days
        };

        try {
            if (editingId) {
                const { error } = await supabase
                    .from('document_definitions')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('document_definitions')
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
            .from('document_definitions')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (!error) loadData();
    };

    const filtered = documents.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d?.key?.toLowerCase().includes(searchTerm.toLowerCase())
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
                        <FileText className="h-6 w-6 text-neutral-600" />
                        Tipos de Documento
                    </h1>
                    <p className="text-neutral-500">Define los documentos, su origen y reglas de seguridad.</p>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                    <Input
                        placeholder="Buscar documento..."
                        className="pl-9 w-full md:w-[300px] bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Documento
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Editar Documento' : 'Nuevo Tipo de Documento'}</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Nombre</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej. INE, Factura, Predial"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Clave (Única)</Label>
                                <Input
                                    value={formData.key}
                                    onChange={e => setFormData({ ...formData, key: e.target.value })}
                                    placeholder="Ej. ine"
                                    disabled={!!editingId && formData.key.trim() !== ''}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Origen</Label>
                                <Select value={formData.origin} onValueChange={v => setFormData({ ...formData, origin: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MDXC">MDXC (Interno)</SelectItem>
                                        <SelectItem value="CLIENT">Cliente</SelectItem>
                                        <SelectItem value="MANUFACTURER">Fabricante</SelectItem>
                                        <SelectItem value="GOVERNMENT">Gobierno</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Clasificación (Acceso)</Label>
                                <Select value={formData.classification} onValueChange={v => setFormData({ ...formData, classification: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PUBLIC">Público</SelectItem>
                                        <SelectItem value="INTERNAL">Interno</SelectItem>
                                        <SelectItem value="CONFIDENTIAL">Confidencial</SelectItem>
                                        <SelectItem value="RESTRICTED">Restringido</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Idioma Original</Label>
                                <Select value={formData.language} onValueChange={v => setFormData({ ...formData, language: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ES">Español</SelectItem>
                                        <SelectItem value="EN">Inglés</SelectItem>
                                        <SelectItem value="ZH">Chino</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 col-span-2">
                                <Label>Descripción</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={2}
                                />
                            </div>

                            {/* Advanced Settings */}
                            <div className="col-span-2 border-t pt-4 mt-2">
                                <Label className="text-neutral-500 mb-2 block">Reglas de Negocio</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Días de Alerta (Vencimiento)</Label>
                                        <Input
                                            type="number"
                                            value={formData.alert_days}
                                            onChange={e => setFormData({ ...formData, alert_days: parseInt(e.target.value) || 0 })}
                                        />
                                        <p className="text-[10px] text-neutral-400">Días antes de vencer para notificar.</p>
                                    </div>
                                    <div className="flex flex-col gap-2 pt-8">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={formData.requires_translation}
                                                onCheckedChange={c => setFormData({ ...formData, requires_translation: c })}
                                            />
                                            <Label>Requiere Traducción</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 border-t pt-2 mt-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_active}
                                        onCheckedChange={c => setFormData({ ...formData, is_active: c })}
                                    />
                                    <Label>Documento Activo</Label>
                                </div>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-emerald-600">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? 'Guardar Cambios' : 'Crear Documento'}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Documento</TableHead>
                                <TableHead>Origen / Acceso</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead className="text-right">Modelo de Campos</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={5} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-neutral-500 truncate max-w-[200px]">{item.description}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {item.key || '-'}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[10px]">
                                                {item.language}
                                            </Badge>
                                            {item.requires_translation && <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Traducción</Badge>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">{item.origin}</div>
                                        <div className="text-xs text-neutral-500">{item.classification}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`
                                            ${item.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-100'}
                                        `}>
                                            {item.is_active ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link href={`/admin/catalogs/documents/${item.id}`}>
                                            <Button size="sm" variant="secondary" className="gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                                                <Settings2 className="h-3 w-3" /> Configurar Campos
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
