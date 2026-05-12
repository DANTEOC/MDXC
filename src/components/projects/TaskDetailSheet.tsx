'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Send, FileText, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';

interface TaskDetailSheetProps {
    task: any;
    onUpdate: () => void;
    trigger?: React.ReactNode;
    userRole?: string | null;
}

export function TaskDetailSheet({ task, onUpdate, trigger, userRole }: TaskDetailSheetProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const router = useRouter();
    const hasConfidentialFields = task.definition?.fields?.some((f: { sensitivity?: string }) => f.sensitivity === 'CONFIDENTIAL');
    const isAnalyst = userRole === 'ANALYST';

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleStatusChange = async (newStatus: string) => {
        setLoading(true);
        const { error } = await supabase
            .from('project_tasks')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', task.id);

        if (!error) {
            onUpdate();
        } else {
            alert('Error updating status');
        }
        setLoading(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);

        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        // Standardize path: project/docDef/timestamp.ext
        const fileName = `${task.document_definition_id}/${Date.now()}.${fileExt}`;
        const filePath = `${task.project_id}/${fileName}`;

        try {
            // 1. Upload to Storage (VAULT - Same as User View)
            const { error: uploadError } = await supabase.storage
                .from('vault')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Upsert into project_documents (Critical for Validation to work)
            const { data: docData, error: docError } = await supabase
                .from('project_documents')
                .upsert({
                    project_id: task.project_id,
                    document_definition_id: task.document_definition_id,
                    status: 'REVIEW_NEEDED',
                    file_path: filePath,
                    file_name: file.name,
                    file_size: file.size,
                    mime_type: file.type,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'project_id, document_definition_id' })
                .select()
                .single();

            if (docError) throw docError;

            // Set the related doc ID immediately so validation button works
            if (docData) setRelatedDocId(docData.id);

            // 3. Update Task Record
            const { error: dbError } = await supabase
                .from('project_tasks')
                .update({
                    status: 'UPLOADED',
                    file_path: filePath,
                    updated_at: new Date().toISOString()
                })
                .eq('id', task.id);

            if (dbError) throw dbError;

            // 4. Trigger AI Extraction (Async)
            if (docData) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    await supabase.functions.invoke('extract-document-data', {
                        body: { document_id: docData.id },
                        headers: {
                            Authorization: `Bearer ${session.access_token}`
                        }
                    });
                }
            }

            if (docData?.extracted_data) {
                // If AI finished super fast or we want to handle updates
            }

            onUpdate();
        } catch (error: any) {
            console.error('Upload flow error:', error);
            alert('Error al subir documento: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const [relatedDocId, setRelatedDocId] = useState<string | null>(null);

    // Fetch related Project Document whenever the sheet opens or task changes
    useEffect(() => {
        if (open && task) {
            fetchRelatedDocument();
        }
    }, [open, task]);

    const fetchRelatedDocument = async () => {
        const { data } = await supabase
            .from('project_documents')
            .select('id, status')
            .eq('project_id', task.project_id)
            .eq('document_definition_id', task.document_definition_id)
            .single();

        if (data) {
            setRelatedDocId(data.id);
        }
    };

    const handleViewDocument = async () => {
        if (!task.file_path) return;
        setLoading(true);
        try {
            // Try vault first (new standard), then project-files (legacy fallback)
            let { data, error } = await supabase.storage
                .from('vault')
                .createSignedUrl(task.file_path, 3600);

            if (error) {
                // Fallback for legacy files
                const { data: legacyData, error: legacyError } = await supabase.storage
                    .from('project-files')
                    .createSignedUrl(task.file_path, 3600);

                if (legacyError) throw error; // Throw original error if both fail
                data = legacyData;
            }

            if (data?.signedUrl) {
                window.open(data.signedUrl, '_blank');
            }
        } catch (error: any) {
            console.error('Error getting signed URL:', error);
            alert('Error al abrir documento: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigateToValidation = async () => {
        let targetId = relatedDocId;

        if (!targetId) {
            setLoading(true);
            // 1. Double check if it exists (Just in case state is stale)
            const { data: existing } = await supabase
                .from('project_documents')
                .select('id')
                .eq('project_id', task.project_id)
                .eq('document_definition_id', task.document_definition_id)
                .maybeSingle();

            if (existing) {
                targetId = existing.id;
            } else if (task.file_path) {
                // 2. SELF-HEALING: Record doesn't exist but Task has file. Create it.
                console.log('Self-healing: Creating missing project_document record...');
                const fileName = task.file_path.split('/').pop() || 'documento.pdf';

                const { data: created, error } = await supabase
                    .from('project_documents')
                    .insert({
                        project_id: task.project_id,
                        document_definition_id: task.document_definition_id,
                        status: task.status === 'VALIDATED' ? 'VALID' : 'REVIEW_NEEDED',
                        file_path: task.file_path,
                        file_name: fileName,
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (created) {
                    targetId = created.id;
                    // Trigger AI for this new record
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        await supabase.functions.invoke('extract-document-data', {
                            body: { document_id: created.id },
                            headers: {
                                Authorization: `Bearer ${session.access_token}`
                            }
                        });
                    }
                }
            }
            setLoading(false);
        }

        if (targetId) {
            router.push(`/projects/${task.project_id}/validate/${targetId}`);
        } else {
            alert('No se pudo localizar ni generar el expediente para este documento.');
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm">Gestionar</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{task.definition?.name}</SheetTitle>
                    <SheetDescription>
                        {task.definition?.description}
                    </SheetDescription>
                </SheetHeader>

                {/* SECURITY ALERT */}
                {isAnalyst && hasConfidentialFields && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-800 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>Documento Confidencial. Solo Supervisores.</span>
                    </div>
                )}

                <div className="py-6 space-y-6">
                    {/* Status Indicator */}
                    <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg border">
                        <span className="text-sm font-medium text-neutral-500">Estado Actual:</span>
                        <Badge variant="outline">{task.status}</Badge>
                    </div>

                    {/* ACTION: PENDING -> REQUEST */}
                    {task.status === 'PENDING' && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-neutral-900">Acciones del Supervisor</h4>
                            <p className="text-sm text-neutral-500">
                                Solicita este documento al responsable (Cliente/Fabricante).
                            </p>
                            <Button
                                onClick={() => handleStatusChange('REQUESTED')}
                                disabled={loading}
                                className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                            >
                                {loading && <Loader2 className="animate-spin h-4 w-4" />}
                                Solicitar Documento
                            </Button>
                        </div>
                    )}

                    {/* ACTION: REQUESTED -> UPLOAD */}
                    {['REQUESTED', 'REJECTED'].includes(task.status) && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-neutral-900">Subir Documento</h4>
                            <div className="border-2 border-dashed border-neutral-300 rounded-lg p-6 text-center hover:bg-neutral-50 transition-colors">
                                <Upload className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                                <Label htmlFor="file-upload" className="cursor-pointer">
                                    <span className="text-blue-600 font-semibold hover:underline">Sube un archivo</span>
                                    <span className="text-neutral-500 block text-xs mt-1">PDF, JPG o PNG hasta 10MB</span>
                                </Label>
                                <Input
                                    id="file-upload"
                                    type="file"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    disabled={uploading}
                                />
                            </div>
                            {uploading && <div className="text-xs text-center text-blue-600 animate-pulse">Subiendo archivo...</div>}
                        </div>
                    )}

                    {/* ACTION: UPLOADED -> REVIEW */}
                    {['UPLOADED', 'IN_REVIEW', 'VALIDATED', 'REVIEW_NEEDED'].includes(task.status) && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-md text-sm">
                                <FileText className="h-4 w-4" />
                                <span className="truncate flex-1">{task.file_path ? task.file_path.split('/').pop() : 'Archivo'}</span>

                                {/* View Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-blue-100"
                                    onClick={handleViewDocument}
                                    disabled={loading || (isAnalyst && hasConfidentialFields)}
                                    title="Ver documento"
                                >
                                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                </Button>

                                {/* Replace Button */}
                                <Label htmlFor="replace-file" className="cursor-pointer">
                                    <div className="h-6 w-6 flex items-center justify-center hover:bg-blue-100 rounded-md transition-colors" title="Sustituir documento">
                                        <Upload className="h-3 w-3" />
                                    </div>
                                    <Input
                                        id="replace-file"
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                    />
                                </Label>
                            </div>

                            {/* New Validation Button - Made Bigger and More Visible */}
                            <Button
                                size="lg"
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white shadow-md font-semibold text-base transition-all"
                                onClick={handleNavigateToValidation}
                                disabled={isAnalyst && hasConfidentialFields}
                            >
                                <FileText className="h-5 w-5 mr-2" />
                                Revisar Datos y Validación
                            </Button>

                            {task.status !== 'VALIDATED' && (
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <Button
                                        variant="outline"
                                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                        onClick={() => handleStatusChange('REJECTED')}
                                        disabled={loading}
                                    >
                                        Rechazar
                                    </Button>
                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                        onClick={() => handleStatusChange('VALIDATED')}
                                        disabled={loading}
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Aprobación Rápida
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* VALIDATION SUCCESS */}
                    {task.status === 'VALIDATED' && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-center gap-3">
                            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                            <span className="text-emerald-800 font-semibold">Documento agregado</span>
                        </div>
                    )}

                </div>
            </SheetContent>
        </Sheet>
    );
}
