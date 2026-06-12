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
import { History, FileText, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { createVaultDocumentSignedUrl, getDocumentVersionHistory, VaultDocumentVersion } from '@/app/actions/vault-actions';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VaultHistoryModalProps {
    vaultDocumentId: string;
    documentName: string;
}

type VaultHistoryVersion = VaultDocumentVersion & {
    uploader?: { full_name?: string; role?: string };
    validator?: { full_name?: string };
};

export function VaultHistoryModal({ vaultDocumentId, documentName }: VaultHistoryModalProps) {
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState<VaultHistoryVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [openingVersionId, setOpeningVersionId] = useState<string | null>(null);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await getDocumentVersionHistory(vaultDocumentId);
            setHistory(data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen) {
            loadHistory();
        }
    };

    const handleOpenFile = async (version: VaultHistoryVersion) => {
        if (!version.file_path) return;

        setOpeningVersionId(version.id);
        try {
            const result = await createVaultDocumentSignedUrl(version.file_path);

            if (!result.success || !result.signedUrl) {
                throw new Error(result.error || 'No se pudo abrir el archivo.');
            }

            window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
        } catch (error: unknown) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Error al abrir el archivo.');
        } finally {
            setOpeningVersionId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-neutral-500">
                    <History className="h-4 w-4 mr-1" /> Historial
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
                <DialogHeader className="pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-indigo-600" />
                        Historial de Versiones
                    </DialogTitle>
                    <DialogDescription>
                        Trazabilidad del documento: <span className="font-medium text-neutral-900">{documentName}</span>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 -mx-6 px-6 py-4">
                    {loading ? (
                        <div className="text-center py-8 text-neutral-500">Cargando historial...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-neutral-500 italic">No hay versiones registradas.</div>
                    ) : (
                        <div className="space-y-6">
                            {history.map((version, index) => (
                                <div key={version.id} className="relative pl-6 border-l-2 border-indigo-100 last:border-transparent">
                                    <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1 border-2 border-white"></div>
                                    
                                    <div className="flex flex-col gap-2 pb-6">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-neutral-900">Versión {version.version_number}</h4>
                                                    {index === 0 && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px] h-5">Actual</Badge>}
                                                </div>
                                                <p className="text-xs text-neutral-500 mt-1">
                                                    Subido el {format(new Date(version.uploaded_at), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => handleOpenFile(version)}
                                                disabled={!version.file_path || openingVersionId === version.id}
                                            >
                                                <FileText className="h-3 w-3 mr-1" /> {openingVersionId === version.id ? 'Abriendo...' : 'Ver archivo'}
                                            </Button>
                                        </div>

                                        <div className="bg-neutral-50 rounded-md p-3 text-sm text-neutral-700 border border-neutral-100">
                                            <span className="font-medium">Motivo:</span> {version.change_reason || 'Carga inicial'}
                                        </div>

                                        <div className="flex flex-col gap-1 text-xs text-neutral-500">
                                            <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-100">
                                                <span>Subido por: <span className="font-medium text-neutral-700">{version.uploader?.full_name || 'Desconocido'}</span> ({version.uploader?.role || 'N/A'})</span>
                                            </div>
                                            
                                            <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-100 mt-1">
                                                {version.is_validated ? (
                                                    <div className="flex items-center text-emerald-600">
                                                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                                        Validado por {version.validator?.full_name || 'Analista'} el {version.validated_at ? format(new Date(version.validated_at), "dd/MM/yyyy") : 'fecha no disponible'}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center text-amber-600">
                                                        <Clock className="h-3.5 w-3.5 mr-1" />
                                                        Pendiente de validación
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
