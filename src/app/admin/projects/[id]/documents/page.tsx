'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Trash2, Plus, Search, FileText, CheckCircle, AlertTriangle, Upload } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function BulkDocumentManagerPage() {
    const params = useParams();
    const router = useRouter();
    const routerParamsId = params.id as string;

    const [availableDocs, setAvailableDocs] = useState<any[]>([]);
    const [projectDocs, setProjectDocs] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, [routerParamsId]);

    async function loadData() {
        if (!routerParamsId) return;
        setLoading(true);

        // 1. Get all definitions
        const { data: allDefs } = await supabase
            .from('document_definitions')
            .select('*')
            .order('name');

        // 2. Get existing project docs
        const { data: currentDocs } = await supabase
            .from('project_documents')
            .select('*, definition:document_definitions(*)')
            .eq('project_id', routerParamsId);

        if (allDefs && currentDocs) {
            setProjectDocs(currentDocs);

            // Filter available: Defs that are NOT in currentDocs (by definition_id)
            const currentDefIds = new Set(currentDocs.map(d => d.document_definition_id));
            const available = allDefs.filter(def => !currentDefIds.has(def.id));
            setAvailableDocs(available);
        }
        setLoading(false);
    }

    const filteredAvailable = availableDocs.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAdd = async (defId: string) => {
        setProcessing(`add-${defId}`);
        try {
            const { error } = await supabase
                .from('project_documents')
                .insert({
                    project_id: routerParamsId,
                    document_definition_id: defId,
                    status: 'MISSING',
                    created_at: new Date().toISOString()
                });

            if (error) throw error;

            // ALSO Add to project_tasks (Workflow)
            const { error: taskError } = await supabase.from('project_tasks').insert({
                project_id: routerParamsId,
                document_definition_id: defId,
                status: 'PENDING'
            });

            if (taskError) console.error('Error creating task:', taskError); // Log but don't block? Or block?

            // Refresh local state without full reload for speed
            await loadData(); // Re-fetching is safer to ensure sync
        } catch (e) {
            console.error(e);
            alert("Error al agregar documento");
        }
        setProcessing(null);
    };

    const handleUpload = async (docId: string, file: File) => {
        if (!file) return;

        // Validation (Images and PDFs allowed)
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            alert("Por favor sube una imagen (JPG, PNG) o un PDF.");
            return;
        }

        setProcessing(`upload-${docId}`);
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `${routerParamsId}/${docId}.${fileExt}`;

            // 1. Upload to Storage (Using 'project-files' bucket logic)
            const { error: uploadError } = await supabase.storage
                .from('project-files')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // 2. Update Document Status
            const { error: dbError } = await supabase
                .from('project_documents')
                .update({
                    status: 'UPLOADED',
                    storage_path: filePath,
                    updated_at: new Date().toISOString()
                })
                .eq('id', docId);

            if (dbError) throw dbError;

            // 3. Update Task Status (Ready for Review?)
            // We need definition_id to find the task
            const doc = projectDocs.find(d => d.id === docId);
            if (doc) {
                await supabase
                    .from('project_tasks')
                    .update({ status: 'PENDING' }) // Ensure it's Pending so Analyst sees it
                    .eq('project_id', routerParamsId)
                    .eq('document_definition_id', doc.document_definition_id);
            }

            await loadData();
        } catch (e: any) {
            console.error(e);
            alert("Error al subir archivo: " + e.message);
        }
        setProcessing(null);
    };

    const handleRemove = async (docId: string, hasFiles: boolean) => {
        if (hasFiles) {
            alert("No se puede eliminar un documento que ya tiene archivos cargados.");
            return;
        }

        if (!confirm("¿Quitar este documento del trámite?")) return;

        setProcessing(`rem-${docId}`);
        try {
            const { error } = await supabase
                .from('project_documents')
                .delete()
                .eq('id', docId);

            if (error) throw error;

            // ALSO Remove from project_tasks (Workflow)
            // We need definition_id. Find it in state.
            const docToRemove = projectDocs.find(d => d.id === docId);
            if (docToRemove && docToRemove.document_definition_id) {
                await supabase
                    .from('project_tasks')
                    .delete()
                    .eq('project_id', routerParamsId)
                    .eq('document_definition_id', docToRemove.document_definition_id);
            }
            await loadData();
        } catch (e) {
            console.error(e);
            alert("Error al remover documento");
        }
        setProcessing(null);
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-6 h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" asChild>
                        <Link href={`/admin/projects/${routerParamsId}`}>
                            <ArrowLeft className="h-5 w-5 mr-2" /> Volver
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Gestionar Expediente</h1>
                        <p className="text-sm text-neutral-500">Agrega o quita documentos requeridos para este trámite.</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">Cargando...</div>
            ) : (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">

                    {/* LEFT COLUMN: Available Catalog */}
                    <Card className="flex flex-col h-full border-neutral-300 shadow-sm bg-neutral-50/50">
                        <CardHeader className="pb-3 border-b border-neutral-200 bg-white shrink-0 rounded-t-xl">
                            <CardTitle className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Search className="h-5 w-5 text-neutral-400" />
                                    Catálogo de Documentos
                                    <Badge variant="secondary" className="ml-2">{availableDocs.length}</Badge>
                                </span>
                            </CardTitle>
                            <div className="pt-4">
                                <Input
                                    placeholder="Buscar documento..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredAvailable.length === 0 ? (
                                <div className="text-center py-12 text-neutral-400">
                                    No se encontraron documentos disponibles.
                                </div>
                            ) : (
                                filteredAvailable.map(def => (
                                    <div key={def.id} className="group flex items-center justify-between p-3 bg-white border border-neutral-200 rounded-lg hover:border-emerald-400 hover:shadow-sm transition-all">
                                        <div className="flex items-start gap-3 overflow-hidden">
                                            <div className="p-2 bg-neutral-100 rounded text-neutral-500 group-hover:text-emerald-600 transition-colors">
                                                <FileText className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-neutral-800 truncate" title={def.name}>{def.name}</div>
                                                <div className="text-xs text-neutral-500 truncate" title={def.description}>{def.description || 'Sin descripción'}</div>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="ml-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 border shrink-0"
                                            onClick={() => handleAdd(def.id)}
                                            disabled={!!processing}
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Agregar
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* RIGHT COLUMN: Project Expedient */}
                    <Card className="flex flex-col h-full border-emerald-200 shadow-md bg-white">
                        <CardHeader className="pb-3 border-b border-emerald-100 bg-emerald-50/30 shrink-0 rounded-t-xl">
                            <CardTitle className="flex items-center justify-between text-emerald-900">
                                <span className="flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                                    Expediente del Trámite
                                    <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-600">{projectDocs.length}</Badge>
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-4 space-y-2">
                            {projectDocs.length === 0 ? (
                                <div className="text-center py-12 text-neutral-400 border-2 border-dashed border-emerald-100 rounded-xl bg-emerald-50/10">
                                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-emerald-300" />
                                    Este trámite aún no tiene documentos requeridos.
                                    <p className="text-sm mt-1">Selecciona del catálogo para comenzar.</p>
                                </div>
                            ) : (
                                projectDocs.map(doc => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-neutral-100 rounded-lg shadow-sm hover:border-red-200 group transition-all">
                                        {/* Info Section */}
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`p-2 rounded ${doc.status === 'VALID' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                                                <FileText className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-neutral-900 truncate" title={doc.definition?.name}>{doc.definition?.name || 'Documento Eliminado'}</div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <Badge variant="outline" className="text-[10px] h-5 px-1">{doc.status}</Badge>
                                                    {doc.storage_path && <span className="text-blue-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Archivo cargado</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions Section */}
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="file"
                                                id={`file-${doc.id}`}
                                                className="hidden"
                                                accept="image/*,application/pdf"
                                                onChange={(e) => e.target.files?.[0] && handleUpload(doc.id, e.target.files[0])}
                                                disabled={!!processing || !!doc.storage_path}
                                            />
                                            <label htmlFor={`file-${doc.id}`}>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="text-neutral-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                                    asChild
                                                    disabled={!!processing || !!doc.storage_path}
                                                    title={doc.storage_path ? "Archivo ya cargado" : "Subir documento fuente"}
                                                >
                                                    <span><Upload className="h-4 w-4" /></span>
                                                </Button>
                                            </label>

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="text-neutral-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                                onClick={() => handleRemove(doc.id, !!doc.storage_path)}
                                                disabled={!!processing || !!doc.storage_path}
                                                title={doc.storage_path ? "No se puede eliminar con archivos" : "Remover del trámite"}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                </div>
            )
            }
        </div >
    );
}
