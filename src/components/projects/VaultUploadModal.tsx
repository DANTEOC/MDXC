'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { uploadVaultDocumentVersion } from '@/app/actions/vault-actions';

interface VaultUploadModalProps {
    projectId: string;
    vaultDocumentId: string;
    documentName: string;
    onUploadSuccess: () => void;
}

export function VaultUploadModal({ projectId, vaultDocumentId, documentName, onUploadSuccess }: VaultUploadModalProps) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [reason, setReason] = useState('');
    const [uploading, setUploading] = useState(false);

    const handleUpload = async () => {
        if (!file || !reason.trim()) return;
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('projectId', projectId);
            formData.append('vaultDocumentId', vaultDocumentId);
            formData.append('changeReason', reason);

            const result = await uploadVaultDocumentVersion(formData);
            
            if (result.success) {
                setOpen(false);
                setFile(null);
                setReason('');
                onUploadSuccess();
            } else {
                alert(`Error al subir: ${result.error}`);
            }
        } catch (error: any) {
            alert(`Error inesperado: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                    <Upload className="h-4 w-4 mr-1" /> Subir
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Subir Nueva Versión</DialogTitle>
                    <DialogDescription>
                        Documento: <span className="font-medium text-neutral-900">{documentName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Archivo</label>
                        <Input
                            type="file"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            accept=".pdf"
                        />
                        {file && (
                            <div className="text-xs text-neutral-500 flex items-center gap-2 mt-1">
                                <FileText className="h-3 w-3" /> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                        )}
                        <p className="text-xs text-neutral-400">Solo se permiten archivos en formato PDF.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Motivo del Cambio</label>
                        <Textarea 
                            placeholder="Describe por qué estás subiendo una nueva versión..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="resize-none h-24"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={uploading}>Cancelar</Button>
                    <Button onClick={handleUpload} disabled={!file || !reason.trim() || uploading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Subir a la Bóveda
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
