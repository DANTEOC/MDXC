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
import { getDocumentVersionHistory, VaultDocumentVersion } from '@/app/actions/vault-actions';
import { ScrollArea } from '@/components/ui/scroll-area';

type VersionHistoryItem = VaultDocumentVersion & {
    signed_url?: string | null;
    uploader?: { full_name?: string | null; role?: string | null } | null;
    validator?: { full_name?: string | null } | null;
};

interface VaultHistoryModalProps {
    vaultDocumentId: string;
    documentName: string;
}

export function VaultHistoryModal({ vaultDocumentId, documentName }: VaultHistoryModalProps) {
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState<VersionHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);

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
                                            {version.signed_url ? (
                                                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                                                    <a href={version.signed_url} target="_blank" rel="noreferrer">
                                                        <FileText className="h-3 w-3 mr-1" /> Ver archivo
                                                    </a>
                                                </Button>
                                            ) : (
                                                <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
                                                    <FileText className="h-3 w-3 mr-1" /> Archivo no disponible
                                                </Button>
                                            )}
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
                                                        Validado por {version.validator?.full_name || 'Analista'} el {format(new Date(version.validated_at), "dd/MM/yyyy")}
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
