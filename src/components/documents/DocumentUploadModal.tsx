'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UploadModalProps {
    projectId: string;
    documentId: string;
    documentName: string;
}

export function DocumentUploadModal({ projectId, documentId, documentName }: UploadModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${documentId}/${Date.now()}.${fileExt}`;
            const filePath = `${projectId}/${fileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('vault')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Update Database Record
            const { error: dbError } = await supabase
                .from('project_documents')
                .update({
                    status: 'REVIEW_NEEDED',
                    file_path: filePath,
                    file_name: file.name,
                    file_size: file.size,
                    mime_type: file.type,
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentId);

            if (dbError) throw dbError;

            // 3. Create History Version (Simplified for now)
            await supabase.from('project_document_versions').insert({
                project_document_id: documentId,
                file_path: filePath,
                change_reason: 'Initial Upload'
            });

            // 4. Trigger AI Extraction (Async)
            console.log('Triggering AI Extraction...');
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: aiResponse, error: fnError } = await supabase.functions.invoke('extract-document-data', {
                    body: { document_id: documentId },
                    headers: {
                        Authorization: `Bearer ${session.access_token}`
                    }
                });

                if (fnError) {
                    console.error('AI Extraction Error:', fnError);
                } else {
                    console.log('AI Extraction Success:', aiResponse);
                    if (aiResponse?.data) {
                        // 5. Update Database with Extracted Data
                        await supabase
                            .from('project_documents')
                            .update({
                                extracted_data: aiResponse.data,
                                status: 'REVIEW_NEEDED' // Ensure status is ready for review
                            })
                            .eq('id', documentId);
                    }
                }
            }

            setOpen(false);
            router.refresh(); // Refresh page to show new status
        } catch (error) {
            alert('Error uploading document');
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-dashed gap-2 hover:border-emerald-500 hover:text-emerald-600">
                    <Upload className="h-3 w-3" /> Subir
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Subir Documento</DialogTitle>
                    <DialogDescription>
                        Carga el archivo para: <span className="font-semibold text-neutral-900">{documentName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <Input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        accept=".pdf,.jpg,.png,.xml"
                    />
                    {file && (
                        <div className="text-xs text-neutral-500 flex items-center gap-2">
                            <FileText className="h-3 w-3" /> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleUpload} disabled={!file || uploading} className="bg-emerald-600">
                        {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar Subida
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Temporary Icon helper
function FileText(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    )
}
