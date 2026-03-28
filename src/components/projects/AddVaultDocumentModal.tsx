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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, X, FileText } from 'lucide-react';
import { addVaultDocument, getProjectDocumentsForVault } from '@/app/actions/vault-actions';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useEffect } from 'react';

interface AddVaultDocumentModalProps {
    projectId: string;
    onSuccess: () => void;
}

export function AddVaultDocumentModal({ projectId, onSuccess }: AddVaultDocumentModalProps) {
    const [open, setOpen] = useState(false);
    
    // Form state
    const [selectedDocId, setSelectedDocId] = useState('');
    const [name, setName] = useState(''); // Will store the human readable name
    const [reason, setReason] = useState('');
    const [orderNumber, setOrderNumber] = useState<number>(1);
    const [currentTag, setCurrentTag] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    
    const [projectDocs, setProjectDocs] = useState<any[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    useEffect(() => {
        if (open) {
            loadProjectDocs();
        }
    }, [open]);

    const loadProjectDocs = async () => {
        setLoadingDocs(true);
        try {
            const docs = await getProjectDocumentsForVault(projectId);
            setProjectDocs(docs);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingDocs(false);
        }
    };
    
    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && currentTag.trim() !== '') {
            e.preventDefault();
            if (!tags.includes(currentTag.trim().toUpperCase())) {
                setTags([...tags, currentTag.trim().toUpperCase()]);
            }
            setCurrentTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleSave = async () => {
        if (!selectedDocId || !name.trim() || !reason.trim()) return;
        setSaving(true);

        try {
            const result = await addVaultDocument(projectId, name.trim(), tags, orderNumber, selectedDocId, reason.trim());
            
            if (result.success) {
                setOpen(false);
                setSelectedDocId('');
                setName('');
                setReason('');
                setOrderNumber(1);
                setTags([]);
                onSuccess();
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (error: any) {
            alert(`Error inesperado: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="h-4 w-4 mr-2" /> Agregar Documento Oficial
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Nuevo Documento en Bóveda</DialogTitle>
                    <DialogDescription>
                        Crea un nuevo contenedor oficial para empezar a versionar este documento.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre del Documento</Label>
                        <Select 
                            value={selectedDocId} 
                            onValueChange={(val) => {
                                setSelectedDocId(val);
                                const doc = projectDocs.find(d => d.id === val);
                                if (doc) setName(doc.name);
                            }} 
                            disabled={loadingDocs}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={loadingDocs ? "Cargando..." : "Selecciona un documento del expediente"} />
                            </SelectTrigger>
                            <SelectContent>
                                {projectDocs.length === 0 ? (
                                    <div className="p-2 text-sm text-neutral-500 text-center">No hay documentos con archivo validado/subido.</div>
                                ) : (
                                    projectDocs.map(doc => (
                                        <SelectItem key={doc.id} value={doc.id}>
                                            <div className="flex flex-col">
                                                <span>{doc.name}</span>
                                                <span className="text-[10px] text-neutral-400">{doc.file_name}</span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-neutral-500">
                            Solo se muestran documentos del expediente que ya tienen un archivo.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason">Motivo (Primera Versión)</Label>
                        <Textarea
                            id="reason"
                            placeholder="Ej. Emisión Original, Documento validado por cliente..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="h-20 resize-none text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="order">Número de Orden</Label>
                        <Input
                            id="order"
                            type="number"
                            min="1"
                            value={orderNumber}
                            onChange={(e) => setOrderNumber(Number(e.target.value))}
                        />
                        <p className="text-xs text-neutral-500">
                            Define la posición en el foliado maestro.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Etiquetas (Tags)</Label>
                        <Input
                            placeholder="Ej. LEGAL, TECNICO (Presiona Enter para agregar)"
                            value={currentTag}
                            onChange={(e) => setCurrentTag(e.target.value)}
                            onKeyDown={handleAddTag}
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                                    {tag}
                                    <button onClick={() => removeTag(tag)} className="hover:text-red-500">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={!selectedDocId || !name.trim() || !reason.trim() || saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Crear Contenedor y Archivar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
