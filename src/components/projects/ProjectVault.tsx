'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, FileCheck } from 'lucide-react';
import { generateProjectFolios } from '@/app/actions/folio-actions';
import { getProjectVaultDocuments, type VaultDocument, type VaultDocumentVersion } from '@/app/actions/vault-actions';
import { VaultHistoryModal } from './VaultHistoryModal';
import { VaultUploadModal } from './VaultUploadModal';
import { AddVaultDocumentModal } from './AddVaultDocumentModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProjectVaultProps {
    projectId: string;
    currentUserRole: string | null;
}

type VaultDocumentWithLatestVersion = VaultDocument & {
    latest_version?: VaultDocumentVersion | null;
};

export function ProjectVault({ projectId, currentUserRole }: ProjectVaultProps) {
    const [documents, setDocuments] = useState<VaultDocumentWithLatestVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const isSupervisorOrAdmin = ['ADMIN', 'SUPERVISOR', 'DIRECTOR'].includes(currentUserRole || '');

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const docs = await getProjectVaultDocuments(projectId);
            setDocuments(docs || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) {
            loadDocuments();
        }
    }, [projectId]);

    const handleGenerateFolios = async () => {
        if (!confirm("¿Generar foliado maestro? Se reemplazarán los folios anteriores si existen.")) return;
        setGenerating(true);
        try {
            const res = await generateProjectFolios(projectId);
            if (res.success) {
                alert(res.message);
                loadDocuments(); // Recargar por si algo cambia
            } else {
                alert(res.message || "Error al generar foliado");
            }
        } catch (error: unknown) {
            alert(error instanceof Error ? error.message : "Error al generar foliado");
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return <div className="p-4 text-center text-neutral-500">Cargando Bóveda...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
                        <Lock className="h-5 w-5 text-indigo-600" />
                        Bóveda Digital (Repositorio Inmutable)
                    </h2>
                    <p className="text-sm text-neutral-500">
                        Documentos oficiales del proyecto con control de versiones y trazabilidad completa.
                    </p>
                </div>

                <div className="flex gap-2">
                    {isSupervisorOrAdmin && (
                        <>
                            <AddVaultDocumentModal 
                                projectId={projectId} 
                                onSuccess={loadDocuments} 
                            />
                            <Button
                                variant="outline"
                                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                                onClick={handleGenerateFolios}
                                disabled={generating || documents.length === 0}
                            >
                                <FileCheck className="w-4 h-4 mr-2" />
                                {generating ? 'Generando...' : 'Foliado Maestro'}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {documents.length === 0 ? (
                <div className="text-center py-12 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                    <Lock className="h-10 w-10 text-neutral-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-neutral-600">Bóveda Vacía</h3>
                    <p className="text-sm text-neutral-400">No hay documentos registrados en la bóveda de este proyecto.</p>
                </div>
            ) : (
                <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-50 text-neutral-600 border-b font-medium">
                            <tr>
                                <th className="px-4 py-3">Orden</th>
                                <th className="px-4 py-3">Documento</th>
                                <th className="px-4 py-3">Etiquetas</th>
                                <th className="px-4 py-3">Última Versión</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {documents.map((doc) => {
                                const latest = doc.latest_version;
                                const isValidated = latest?.is_validated;

                                return (
                                    <tr key={doc.id} className="hover:bg-neutral-50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-neutral-500">{String(doc.order_number).padStart(3, '0')}</td>
                                        <td className="px-4 py-3 font-medium text-neutral-900">{doc.name}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1 flex-wrap">
                                                {doc.tags?.map((t: string) => (
                                                    <Badge key={t} variant="secondary" className="text-xs bg-neutral-100">{t}</Badge>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-neutral-500">
                                            {latest ? (
                                                <div className="flex flex-col">
                                                    <span>v{latest.version_number}</span>
                                                    <span className="text-xs">{format(new Date(latest.uploaded_at), "d MMM, yyyy", { locale: es })}</span>
                                                </div>
                                            ) : (
                                                <span className="text-neutral-400 italic">Sin versiones</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {latest ? (
                                                isValidated ? (
                                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Validado</Badge>
                                                ) : (
                                                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendiente Revisión</Badge>
                                                )
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <VaultHistoryModal 
                                                    vaultDocumentId={doc.id}
                                                    documentName={doc.name}
                                                />
                                                {isSupervisorOrAdmin && (
                                                    <VaultUploadModal 
                                                        projectId={projectId}
                                                        vaultDocumentId={doc.id}
                                                        documentName={doc.name}
                                                        onUploadSuccess={loadDocuments}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
