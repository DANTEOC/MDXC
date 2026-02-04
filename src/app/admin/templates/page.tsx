'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Upload, Trash2, FileText, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadTemplates();
    }, []);

    async function loadTemplates() {
        const { data } = await supabase
            .from('document_templates')
            .select('*')
            .order('created_at', { ascending: false });
        if (data) setTemplates(data);
    }

    const handleUpload = async () => {
        if (!file || !newTemplateName) return;
        setUploading(true);

        try {
            const fileName = `${Date.now()}_${file.name}`;
            const { error: storageError } = await supabase.storage
                .from('templates')
                .upload(fileName, file);

            if (storageError) throw storageError;

            const { error: dbError } = await supabase.from('document_templates').insert({
                name: newTemplateName,
                file_path: fileName,
                engine_type: 'DOCX'
            });

            if (dbError) throw dbError;

            setIsUploadOpen(false);
            setNewTemplateName('');
            setFile(null);
            loadTemplates();
        } catch (error) {
            console.error(error);
            alert('Error uploading template');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, path: string) => {
        if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return;

        await supabase.storage.from('templates').remove([path]);
        await supabase.from('document_templates').delete().eq('id', id);
        loadTemplates();
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-neutral-800">Gestor de Plantillas</h1>
                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nueva Plantilla
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Subir Plantilla DOCX</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre de la Plantilla</Label>
                                <Input
                                    placeholder="Ej: Formato Solicitud Salud"
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Archivo Word (.docx)</Label>
                                <Input
                                    type="file"
                                    accept=".docx"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                            </div>
                            <Button onClick={handleUpload} disabled={uploading || !file || !newTemplateName} className="w-full">
                                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Subir y Guardar
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Archivo</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {templates.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-neutral-400">
                                        No hay plantillas registradas.
                                    </TableCell>
                                </TableRow>
                            )}
                            {templates.map((tmpl) => (
                                <TableRow key={tmpl.id}>
                                    <TableCell className="font-medium flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-blue-600" />
                                        {tmpl.name}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-neutral-500">{tmpl.file_path}</TableCell>
                                    <TableCell className="text-neutral-500">
                                        {new Date(tmpl.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right flex items-center justify-end gap-2">
                                        <Link href={`/admin/templates/${tmpl.id}`}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-neutral-500 hover:text-blue-600 hover:bg-blue-50"
                                                title="Configurar Variables"
                                            >
                                                <Settings className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDelete(tmpl.id, tmpl.file_path)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
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
