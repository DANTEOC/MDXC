'use client';

import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from '@/components/ui/label';
import {
    Loader2, Plus, ArrowLeft, ArrowRight, Trash2, ShieldAlert, CheckCircle2, Eye, EyeOff, Bot, Edit, CalendarClock, Lock, ArrowUp, ArrowDown
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from '@/components/ui/textarea';
import * as pdfjsLib from 'pdfjs-dist';
import { DocumentValidator } from '@/components/documents/DocumentValidator';

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';
}

// Helper function to normalize field names for key_identifier
const normalizeFieldName = (name: string): string => {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .trim()
        .replace(/\s+/g, '_'); // Spaces to underscores
};

const generateKeyIdentifier = (docCode: string, fieldName: string): string => {
    if (!fieldName.trim()) return '';
    return `${docCode}_${normalizeFieldName(fieldName)}`;
};

// Default form values for new fields
const DEFAULT_FIELD_FORM = {
    name: '',
    key_identifier: '',
    description: '',
    field_type: 'text',
    validation_regex: '',
    is_required: true,
    sensitivity: 'STANDARD' as 'STANDARD' | 'CONFIDENTIAL',
    ai_instructions: '',
    is_visible_to_analyst: true,
    is_expiration_date: false,
    is_editable: false
};

export default function FieldConfigPage() {
    const params = useParams();
    const router = useRouter();
    const [documentInfo, setDocumentInfo] = useState<any>(null);
    const [fields, setFields] = useState<any[]>([]);
    const [fieldTypes, setFieldTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Dialog & Form
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState(DEFAULT_FIELD_FORM);

    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [uploadedTemplate, setUploadedTemplate] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<any>(null);
    const [testing, setTesting] = useState(false);
    const [expectedValues, setExpectedValues] = useState<Record<string, string>>({});

    // PDF State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [renderTask, setRenderTask] = useState<any>(null);

    useEffect(() => {
        if (params.id) {
            loadData();
            loadFieldTypes();
            loadTemplate();
        }
    }, [params.id]);

    useEffect(() => {
        if (uploadedTemplate?.file_path) {
            getSignedUrl(uploadedTemplate.file_path);
        }
    }, [uploadedTemplate]);

    // Auto-generate key_identifier when name changes (only for NEW fields)
    useEffect(() => {
        if (!editingFieldId && formData.name && documentInfo) {
            // Use document code if available, otherwise use normalized name as fallback
            const docPrefix = documentInfo.code || normalizeFieldName(documentInfo.name || 'DOC');
            const generatedKey = generateKeyIdentifier(docPrefix, formData.name);
            setFormData(prev => ({ ...prev, key_identifier: generatedKey }));
        }
    }, [formData.name, documentInfo, editingFieldId]);

    const getSignedUrl = async (path: string) => {
        const { data, error } = await supabase.storage
            .from('templates')
            .createSignedUrl(path, 3600); // 1 hour

        if (data?.signedUrl) {
            setPreviewUrl(data.signedUrl);
        }
    };

    const loadTemplate = async () => {
        const { data } = await supabase
            .from('document_templates')
            .select('*')
            .eq('document_definition_id', params.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (data) {
            setUploadedTemplate(data);
            if (data.validation_data) {
                setExpectedValues(data.validation_data);
            }
        }
    };

    // Auto-save validation data debounce
    useEffect(() => {
        if (!uploadedTemplate) return;
        const timer = setTimeout(async () => {
            // Only save if there are changes and we have a template
            if (Object.keys(expectedValues).length > 0) {
                await supabase
                    .from('document_templates')
                    .update({ validation_data: expectedValues })
                    .eq('id', uploadedTemplate.id);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [expectedValues, uploadedTemplate]);

    // PDF Loading
    useEffect(() => {
        if (!previewUrl || !uploadedTemplate?.name.toLowerCase().endsWith('.pdf')) return;
        const loadPdf = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument(previewUrl);
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
                setPageNum(1);
            } catch (error) {
                console.error("Error loading PDF:", error);
                alert("Error al cargar el PDF.");
            }
        };
        loadPdf();
    }, [previewUrl, uploadedTemplate]);

    // PDF Rendering
    useEffect(() => {
        if (!pdfDoc) return;
        const renderPage = async () => {
            if (renderTask) renderTask.cancel();
            try {
                const page = await pdfDoc.getPage(pageNum);
                const canvas = canvasRef.current;
                if (!canvas) return;
                const context = canvas.getContext('2d');
                if (!context) return;
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;
            } catch (error: any) {
                if (error.name !== 'RenderingCancelledException') console.error("Render error:", error);
            }
        };
        renderPage();
    }, [pdfDoc, pageNum]);

    const handleExtractPage = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        await handleTestExtraction(dataUrl);
    };

    const handleTestExtraction = async (base64Image?: any) => {
        if (!uploadedTemplate) return alert('Primero sube un documento semilla.');

        const isBase64 = typeof base64Image === 'string';
        const imgData = isBase64 ? base64Image : undefined;

        if (!imgData && uploadedTemplate.name.toLowerCase().endsWith('.pdf')) {
            alert("Para archivos PDF, utiliza el botón 'Extraer Pág' debajo del visor.");
            return;
        }

        setTesting(true);
        setTestResults(null);

        try {
            // Get active session for authorization
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                throw new Error("No hay sesión activa. Por favor recarga la página o inicia sesión nuevamente.");
            }

            console.log("Invoking Edge Function 'extract-document-data'...");
            const { data, error } = await supabase.functions.invoke('extract-document-data', {
                body: {
                    simulation_mode: true,
                    file_path: uploadedTemplate.file_path,
                    document_name: documentInfo?.name,
                    fields_config: fields,
                    image_data: imgData
                },
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            });

            if (error) {
                console.error("Supabase Invoke Error Details:", error);

                let errorMessage = error.message;

                // Try to get JSON body from error response if available
                if (error instanceof Error && 'context' in error) {
                    try {
                        const response = (error as any).context as Response;
                        if (response && typeof response.json === 'function') {
                            const errBody = await response.json();
                            if (errBody.error) errorMessage = errBody.error;
                        }
                    } catch (e) {
                        console.log("Could not parse error body", e);
                    }
                }

                if (errorMessage === "Failed to fetch") {
                    alert("Error de conexión: No se pudo contactar al servidor.");
                } else {
                    alert(`Error en función: ${errorMessage}`);
                }
                throw error;
            }

            if (data.error) throw new Error(data.error);

            setTestResults(data.data);

        } catch (error: any) {
            console.error('Test Execution Error:', error);
            // Alert is already handled above for specific invoke errors
        } finally {
            setTesting(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        // Get Document Info
        const { data: docData } = await supabase
            .from('document_definitions')
            .select('*')
            .eq('id', params.id)
            .single();

        if (docData) setDocumentInfo(docData);

        // Get Fields
        const { data: fieldsData } = await supabase
            .from('field_definitions')
            .select('*')
            .eq('document_definition_id', params.id)
            .order('display_order', { ascending: true });

        if (fieldsData) setFields(fieldsData);
        setLoading(false);
    };

    const loadFieldTypes = async () => {
        const { data } = await supabase
            .from('catalog_field_types')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (data) {
            // UI REFINEMENT: Hide confusing duplicate table types and rename standard 'table' to 'Tabla Estructurada'
            // asking user to use 'table' (which has the logic) but seeing 'Tabla Estructurada'
            const refined = data
                .filter(t => t.key !== 'structured_table')
                .map(t => t.key === 'table' ? { ...t, name: 'Tabla Estructurada (Estricta)' } : t);
            setFieldTypes(refined);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const filePath = `seed-docs/${params.id}/${Date.now()}.${fileExt}`;

        try {
            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Register in DB
            const { data: templateData, error: dbError } = await supabase
                .from('document_templates')
                .insert({
                    document_definition_id: params.id,
                    name: file.name,
                    file_path: filePath,
                    engine_type: 'LLM_GPT4' // Default for now
                })
                .select()
                .single();

            if (dbError) throw dbError;

            setUploadedTemplate(templateData);
            alert('Documento semilla cargado correctamente');
        } catch (error: any) {
            console.error('Error uploading seed:', error);
            alert('Error al subir el documento: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleEdit = (field: any) => {
        setEditingFieldId(field.id);
        setFormData({
            name: field.name,
            key_identifier: field.key_identifier,
            description: field.description || '',
            field_type: field.field_type,
            validation_regex: field.validation_regex || '',
            is_required: field.is_required,
            sensitivity: field.sensitivity,
            ai_instructions: field.ai_instructions || '',
            is_visible_to_analyst: field.is_visible_to_analyst,
            is_expiration_date: field.is_expiration_date || false,
            is_editable: field.is_editable !== false // default true
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.key_identifier || !formData.field_type) {
            return alert('Nombre, Clave y Tipo son obligatorios');
        }
        setIsSubmitting(true);

        const payload = {
            document_definition_id: params.id,
            name: formData.name,
            key_identifier: formData.key_identifier.toLowerCase().trim().replace(/\s+/g, '_'),
            description: formData.description,
            field_type: formData.field_type,
            validation_regex: formData.validation_regex,
            is_required: formData.is_required,
            sensitivity: formData.sensitivity,
            ai_instructions: formData.ai_instructions,
            is_visible_to_analyst: formData.is_visible_to_analyst,
            is_expiration_date: formData.is_expiration_date,
            is_editable: formData.is_editable
        };

        try {
            if (editingFieldId) {
                // UPDATE
                const { error } = await supabase
                    .from('field_definitions')
                    .update(payload)
                    .eq('id', editingFieldId);
                if (error) throw error;
            } else {
                // CREATE
                const { error } = await supabase
                    .from('field_definitions')
                    .insert([payload]);
                if (error) throw error;
            }

            setIsDialogOpen(false);
            setFormData({
                name: '', key_identifier: '', description: '', field_type: '',
                validation_regex: '', is_required: false, sensitivity: 'STANDARD',
                ai_instructions: '', is_visible_to_analyst: true, is_expiration_date: false,
                is_editable: true
            });
            setEditingFieldId(null);
            loadData();
        } catch (error: any) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este campo?')) return;
        const { error } = await supabase.from('field_definitions').delete().eq('id', id);
        if (!error) loadData();
    };

    const handleMoveUp = async (field: any, index: number) => {
        if (index === 0) return; // Already at top
        const prevField = fields[index - 1];

        // Swap display_order values
        await supabase
            .from('field_definitions')
            .update({ display_order: prevField.display_order })
            .eq('id', field.id);

        await supabase
            .from('field_definitions')
            .update({ display_order: field.display_order })
            .eq('id', prevField.id);

        loadData();
    };

    const handleMoveDown = async (field: any, index: number) => {
        if (index === fields.length - 1) return; // Already at bottom
        const nextField = fields[index + 1];

        // Swap display_order values
        await supabase
            .from('field_definitions')
            .update({ display_order: nextField.display_order })
            .eq('id', field.id);

        await supabase
            .from('field_definitions')
            .update({ display_order: field.display_order })
            .eq('id', nextField.id);

        loadData();
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/catalogs/documents">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                            Configuración de Campos: <span className="text-emerald-700">{documentInfo?.name || 'Cargando...'}</span>
                        </h1>
                        <p className="text-neutral-500">Define qué datos buscar en este tipo de documento.</p>
                    </div>
                </div>
            </div>

            {/* Global Dialog for Field Config (Shared across tabs) */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                    setEditingFieldId(null);
                    setFormData(DEFAULT_FIELD_FORM);
                }
            }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editingFieldId ? 'Editar Campo' : 'Nuevo Campo'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4 max-h-[70vh] overflow-y-auto px-1">
                        <div className="space-y-2 col-span-2">
                            <Label>Nombre del Campo</Label>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej. CURP, Monto Total"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="flex items-center gap-2">
                                Clave (Identificador)
                                <Badge variant="outline" className="text-[10px] font-normal">Auto-generado</Badge>
                            </Label>
                            <Input
                                value={formData.key_identifier}
                                disabled={true}
                                className="bg-neutral-50 font-mono text-xs text-neutral-600 cursor-not-allowed"
                            />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Descripción (Documentación)</Label>
                            <Input
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Explica qué es este campo y para qué sirve..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo de Dato</Label>
                            <Select
                                value={formData.field_type}
                                onValueChange={v => setFormData({ ...formData, field_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {fieldTypes.map(t => (
                                        <SelectItem key={t.key} value={t.key}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Instrucción para IA (Contexto Extra)</Label>
                            <Textarea
                                value={formData.ai_instructions}
                                onChange={e => setFormData({ ...formData, ai_instructions: e.target.value })}
                                placeholder="Ej. 'Busca el código de barras en la esquina inferior izquierda...'"
                                rows={2}
                            />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <div className="flex items-center justify-between">
                                <Label>Expresión Regular (Regex) - Opcional</Label>
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:text-blue-700">
                                            💡 Ver Ejemplos
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>Ejemplos de Expresiones Regulares (RegEx)</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-3 text-sm">
                                            <div className="border-l-4 border-blue-500 pl-3 py-2 bg-blue-50">
                                                <p className="font-mono text-xs mb-1">{'^[A-Z]{4}\\d{6}[A-Z\\d]{3}$'}</p>
                                                <p className="text-neutral-600">CURP (18 caracteres: 4 letras, 6 dígitos, 3 alfanuméricos)</p>
                                            </div>
                                            <div className="border-l-4 border-emerald-500 pl-3 py-2 bg-emerald-50">
                                                <p className="font-mono text-xs mb-1">{'^[A-Z&]{3,4}\\d{6}[A-Z\\d]{3}$'}</p>
                                                <p className="text-neutral-600">RFC (12-13 caracteres)</p>
                                            </div>
                                            <div className="border-l-4 border-amber-500 pl-3 py-2 bg-amber-50">
                                                <p className="font-mono text-xs mb-1">{'^\\d{4}-\\d{2}-\\d{2}$'}</p>
                                                <p className="text-neutral-600">Fecha formato ISO (YYYY-MM-DD)</p>
                                            </div>
                                            <div className="border-l-4 border-violet-500 pl-3 py-2 bg-violet-50">
                                                <p className="font-mono text-xs mb-1">{'^\\$?[\\d,]+(\\.\\d{2})?$'}</p>
                                                <p className="text-neutral-600">Monto monetario (con o sin $, con decimales opcionales)</p>
                                            </div>
                                            <div className="border-l-4 border-red-500 pl-3 py-2 bg-red-50">
                                                <p className="font-mono text-xs mb-1">{'^[\\w.-]+@[\\w.-]+\\.\\w+$'}</p>
                                                <p className="text-neutral-600">Email básico</p>
                                            </div>
                                            <p className="text-xs text-neutral-500 mt-4 pt-3 border-t">💡 <strong>Tip</strong>: Usa herramientas como <a href="https://regex101.com" target="_blank" className="text-blue-600 underline">regex101.com</a> para probar tus expresiones.</p>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <Input
                                value={formData.validation_regex}
                                onChange={e => setFormData({ ...formData, validation_regex: e.target.value })}
                                placeholder="Ej. ^[A-Z]{4}\d{6}..."
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-neutral-400">Patrón para validación automática del formato.</p>
                        </div>

                        <div className="flex flex-col gap-4 pt-4 col-span-2 border-t mt-2">
                            <div className="flex justify-between">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_required}
                                        onCheckedChange={c => setFormData({ ...formData, is_required: c })}
                                    />
                                    <Label>Obligatorio</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_editable}
                                        onCheckedChange={c => setFormData({ ...formData, is_editable: c })}
                                    />
                                    <Label>Editable por Analista</Label>
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={formData.sensitivity === 'CONFIDENTIAL'}
                                            onCheckedChange={c => setFormData({ ...formData, sensitivity: c ? 'CONFIDENTIAL' : 'STANDARD' })}
                                            className="data-[state=checked]:bg-amber-500"
                                        />
                                        <Label className={formData.sensitivity === 'CONFIDENTIAL' ? 'text-amber-600 font-bold' : ''}>Dato Confidencial (Sensible)</Label>
                                    </div>
                                    <p className="text-[10px] text-neutral-500 ml-11">Si está activado, solo Supervisores pueden ver este campo. Si está desactivado, todos los roles pueden verlo.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_expiration_date}
                                        onCheckedChange={c => setFormData({ ...formData, is_expiration_date: c })}
                                        className="data-[state=checked]:bg-blue-600"
                                    />
                                    <Label className={formData.is_expiration_date ? 'text-blue-600 font-bold' : ''}>Es Fecha de Vencimiento</Label>
                                </div>
                            </div>
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-emerald-600">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Campo
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Tabs defaultValue="fields" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-4">
                    <TabsTrigger value="fields">Campos</TabsTrigger>
                    <TabsTrigger value="seed">Prueba Semilla (Nuevo)</TabsTrigger>
                </TabsList>

                <TabsContent value="fields" className="space-y-6">
                    <div className="flex justify-end">
                        <Button className="bg-emerald-600 gap-2" onClick={() => {
                            setEditingFieldId(null);
                            setFormData(DEFAULT_FIELD_FORM);
                            setIsDialogOpen(true);
                        }}>
                            <Plus className="h-4 w-4" /> Agregar Campo
                        </Button>
                    </div>
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Campo</TableHead>
                                        <TableHead>Clave</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Reglas IA</TableHead>
                                        <TableHead className="text-center">Editable</TableHead>
                                        <TableHead>Acceso</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading && <TableRow><TableCell colSpan={7} className="text-center py-10">Cargando...</TableCell></TableRow>}
                                    {!loading && fields.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-10 text-neutral-400">
                                                No hay campos configurados para este documento.
                                            </TableCell>
                                        </TableRow>
                                    )}

                                    {!loading && fields.map((field, idx) => (
                                        <TableRow key={field.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>
                                                        {field.name}
                                                        {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                                    </span>
                                                    {field.description && (
                                                        <span className="text-[10px] text-neutral-400 font-normal truncate max-w-[150px]" title={field.description}>
                                                            {field.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-neutral-500">{field.key_identifier}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{field.field_type}</Badge>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {field.ai_instructions ? (
                                                    <div className="flex items-center gap-1 text-emerald-600" title={field.ai_instructions}>
                                                        <Bot className="h-3 w-3" /> Con Pista IA
                                                    </div>
                                                ) : <span className="text-neutral-300">-</span>}
                                                {field.is_expiration_date && (
                                                    <div className="flex items-center gap-1 text-blue-600 text-[10px] mt-1 font-semibold">
                                                        <CalendarClock className="h-3 w-3" /> Vencimiento
                                                    </div>
                                                )}
                                                {field.validation_regex && <div className="font-mono text-[10px] text-neutral-400 mt-1">Regex: ...{field.validation_regex.slice(-10)}</div>}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {field.is_editable !== false ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                                ) : (
                                                    <Lock className="h-4 w-4 text-neutral-400 mx-auto" />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {field.sensitivity === 'CONFIDENTIAL' && <Badge variant="outline" className="text-amber-600 border-amber-200 flex gap-1 w-fit"><ShieldAlert className="h-3 w-3" /> Confidencial</Badge>}
                                                    {!field.is_visible_to_analyst && <Badge variant="outline" className="text-neutral-500 border-neutral-200 flex gap-1 w-fit"><EyeOff className="h-3 w-3" /> Oculto Analista</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleMoveUp(field, idx)}
                                                        disabled={idx === 0}
                                                        title="Mover arriba"
                                                    >
                                                        <ArrowUp className="h-4 w-4 text-neutral-400 hover:text-blue-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleMoveDown(field, idx)}
                                                        disabled={idx === fields.length - 1}
                                                        title="Mover abajo"
                                                    >
                                                        <ArrowDown className="h-4 w-4 text-neutral-400 hover:text-blue-600" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleEdit(field)}>
                                                        <Edit className="h-4 w-4 text-neutral-500 hover:text-emerald-600" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(field.id)}>
                                                        <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>


                <TabsContent value="seed">
                    <Card>
                        <CardHeader>
                            <CardTitle>Prueba de Documento Semilla (Validación)</CardTitle>
                            <p className="text-sm text-neutral-500">
                                Sube un documento de ejemplo y prueba la extracción con los campos configurados.
                            </p>
                        </CardHeader>
                        <CardContent>
                            {!uploadedTemplate ? (
                                <div className="border-2 border-dashed border-neutral-200 rounded-lg h-[600px] flex flex-col items-center justify-center bg-neutral-50/50 hover:bg-neutral-50 transition-colors relative">
                                    <input
                                        type="file"
                                        accept="application/pdf,image/*"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                    />
                                    <div className="text-center space-y-4 pointer-events-none p-6">
                                        <div className="bg-emerald-100 p-3 rounded-full w-fit mx-auto">
                                            <CalendarClock className="h-6 w-6 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-neutral-900">Sube un documento de ejemplo</p>
                                            <p className="text-sm text-neutral-500 mt-1">PDF o Imagen (Máx 5MB)</p>
                                        </div>
                                        {uploading && (
                                            <div className="flex items-center gap-2 text-emerald-600">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span>Subiendo...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <DocumentValidator
                                    documentId={uploadedTemplate.id}
                                    fields={fields}
                                    fileUrl={previewUrl}
                                    mode="seed"
                                    initialData={testResults || {}}
                                    onDataChange={(newData) => {
                                        if (testing) return;
                                        setTestResults(newData);
                                    }}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
