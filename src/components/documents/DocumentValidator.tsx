'use client';

import { useEffect, useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, ArrowLeft, ArrowRight, Save, Bot, Upload, Download, Maximize2, Eye, ZoomIn, ZoomOut } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileUploadField } from '@/components/admin/FileUploadField';
import { TableField } from '@/components/admin/TableField';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';
}

// Helper Function for Universal Table Extraction Strategy
const generateTablePrompt = (
    key: string,
    existingData: any[],
    strictHeaders: string[] | undefined
): { instructions: string, headers: string[] | undefined } => {

    // MODE 1: PREDEFINED STRICT (Table 1)
    if (strictHeaders && strictHeaders.length > 0) {
        const headerList = strictHeaders.join('", "');
        const columnCount = strictHeaders.length;
        return {
            headers: strictHeaders,
            instructions: `CRÍTICO: Esta tabla principal DEBE tener EXACTAMENTE ${columnCount} columnas: ["${headerList}"].
REGLAS:
1. Devuelve TODAS las ${columnCount} columnas en el MISMO orden.
2. Si una tabla en la imagen NO TIENE estas ${columnCount} columnas (ej: tiene menos o es diferente), NO LA PONGAS AQUÍ. Déjala vacía [].
3. NO fusiones columnas.
4. SOLO extrae si coincide con la estructura requerida.`
        };
    }

    // MODE 2: DYNAMIC HISTORY STRICTNESS (Table 2+ after first page)
    const hasHistory = Array.isArray(existingData) && existingData.length > 0;
    if (hasHistory) {
        const firstRow = existingData[0];
        if (typeof firstRow === 'object' && firstRow !== null) {
            const inferredHeaders = Object.keys(firstRow);
            const columnCount = inferredHeaders.length;
            const headerList = inferredHeaders.join('", "');
            return {
                headers: inferredHeaders,
                instructions: `IMPORTANTE: Esta tabla YA TIENE una estructura definida previamente. DEBES RESPETARLA.
Columnas Esperadas (${columnCount}): ["${headerList}"].
REGLAS:
1. Extrae los datos de esta página y mapealos EXACTAMENTE a estas columnas.
2. NO inventes columnas nuevas.
3. NO omitas columnas existentes.
4. Si la tabla visual tiene ligeras variaciones, FUERZA los datos a este esquema.`
            };
        }
    }

    // MODE 3: DISCOVERY (New Unknown Table)
    return {
        headers: undefined,
        instructions: `INSTRUCCIÓN DE DESCUBRIMIENTO:
Esta es una tabla nueva. Extrae su estructura VISUAL tal cual aparece en la imagen.
- Identifica todas las columnas visibles.
- Usa los textos de la cabecera como nombres de propiedades JSON.
- Separa claramente columnas pegadas.`
    };
};

interface DocumentValidatorProps {
    documentId: string;
    fields: any[];
    fileUrl: string | null;
    mode: 'project' | 'seed';
    initialData?: Record<string, any>;
    onDataChange?: (data: Record<string, any>) => void;
    onSave?: (data: Record<string, any>) => Promise<void>;
    onValidate?: (isValid: boolean) => Promise<void>;
    projectId?: string;
}

export function DocumentValidator({
    documentId,
    fields,
    fileUrl,
    mode,
    initialData = {},
    onDataChange,
    onSave,
    onValidate,
    projectId
}: DocumentValidatorProps) {
    const effectiveProjectId = projectId || 'seed-test-project';
    const [formData, setFormData] = useState<Record<string, any>>(initialData);

    // Sync with initialData if it changes (and is not empty, to avoid wiping worked data on remount if parent passes fresh empty object?)
    // Actually, parent passes testResults. If testResults updates, we want to update formData.
    // But if we edit formData, we update parent.
    // If parent updates (e.g. re-extraction), we update formData.
    useEffect(() => {
        if (initialData) {
            setFormData(prev => {
                // Only update if different to avoid loops? 
                // Simple approach: Always set if initialData changes reference. 
                // But initialData from parent might be the SAME object reference if we update it via onDataChange.
                // We rely on parent to manage the source of truth for "persistence".
                return initialData;
            });
        }
    }, [initialData]);

    const handleFieldChange = (key: string, value: any) => {
        const newData = { ...formData, [key]: value };
        setFormData(newData);
        if (onDataChange) {
            onDataChange(newData);
        }
    };

    const [saving, setSaving] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [viewField, setViewField] = useState<{ name: string, content: string } | null>(null);
    const [appendMode, setAppendMode] = useState(true); // Default to Append Mode for fluid workflow


    // PDF State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.5);
    const renderTaskRef = useRef<any>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load PDF
    useEffect(() => {
        if (fileUrl) {
            loadPdf();
        }
    }, [fileUrl]);

    // Render page when PDF or pageNum changes
    useEffect(() => {
        if (pdfDoc) {
            renderPage();
        }
    }, [pdfDoc, pageNum, scale]);

    const loadPdf = async () => {
        if (!fileUrl) return;
        try {
            const loadingTask = pdfjsLib.getDocument(fileUrl);
            const pdf = await loadingTask.promise;
            setPdfDoc(pdf);
            setTotalPages(pdf.numPages);
            setPageNum(1);
        } catch (error) {
            console.error('Error loading PDF:', error);
        }
    };

    const renderPage = async () => {
        if (!pdfDoc || !canvasRef.current) return;



        try {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }

            const page = await pdfDoc.getPage(pageNum);
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            const viewport = page.getViewport({ scale: scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const task = page.render({
                canvasContext: context,
                viewport: viewport
            });

            renderTaskRef.current = task;

            await task.promise;
        } catch (error: any) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Error rendering page:', error);
            }
        }
    };

    const prevPage = () => {
        if (pageNum > 1) setPageNum(pageNum - 1);
    };

    const nextPage = () => {
        if (pdfDoc && pageNum < pdfDoc.numPages) setPageNum(pageNum + 1);
    };



    const handleExtractPage = async () => {
        if (!canvasRef.current) return;

        setExtracting(true);
        try {
            const canvas = canvasRef.current;
            const base64Image = canvas.toDataURL('image/png');

            await handleRetryAI(base64Image);
        } catch (error) {
            console.error('Error extracting page:', error);
            alert('Error al extraer la página');
        } finally {
            setExtracting(false);
        }
    };

    const handleRetryAI = async (base64Image?: string) => {
        setExtracting(true);

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
            if (sessionError || !session) {
                throw new Error("No hay sesión activa");
            }

            const targetFields = fields.map((f: any) => {
                const currentValue = formData[f.key_identifier];
                let enhancedInstructions = f.ai_instructions || `Extrae el campo "${f.name}"`;

                if (f.field_type === 'structured_table') {
                    const strictHeaders = f.strict_headers ? JSON.parse(f.strict_headers) : undefined;
                    const tablePrompt = generateTablePrompt(
                        f.key_identifier,
                        Array.isArray(currentValue) ? currentValue : [],
                        strictHeaders
                    );
                    enhancedInstructions = tablePrompt.instructions + '\n\n' + enhancedInstructions;
                }

                return {
                    key_identifier: f.key_identifier,
                    name: f.name,
                    field_type: f.field_type,
                    ai_instructions: enhancedInstructions,
                    current_value: currentValue
                };
            });

            const body: any = {
                fields_config: targetFields, // Renamed from fields to match Edge Function
                page_number: pageNum,
                image_data: base64Image, // Renamed from image_override to match Edge Function
                simulation_mode: mode === 'seed' // Enable simulation mode for seed documents
            };

            // Only include document_id for project mode
            if (mode === 'project') {
                body.document_id = documentId;
                body.simulation_mode = false;
            }

            const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-document-data`;
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            console.log('Extraction Result:', result);

            const data = result.data || result.extracted_data;

            if (data) {
                setFormData(prev => {
                    const newData = { ...prev };

                    Object.keys(data).forEach(key => {
                        const fieldConfig = fields.find((f: any) => f.key_identifier === key);
                        const isTable = fieldConfig?.field_type === 'table' || fieldConfig?.field_type === 'structured_table';
                        const prevValue = prev[key];
                        const newValue = data[key];

                        if (appendMode) {
                            if (isTable && Array.isArray(prevValue) && Array.isArray(newValue)) {
                                // APPEND Logic for Tables
                                newData[key] = [...prevValue, ...newValue];
                            } else if (typeof prevValue === 'string' && typeof newValue === 'string' && prevValue.trim() !== '') {
                                // Smart Append for Text (Prevent duplicates)
                                const cleanPrev = prevValue.trim();
                                const cleanNew = newValue.trim();

                                if (cleanPrev === cleanNew || cleanPrev.endsWith(cleanNew)) {
                                    // Duplicate detected: Do nothing (or update if needed, but usually ignore)
                                    // This handles "Retry same page" scenario
                                } else {
                                    newData[key] = prevValue + '\n\n' + newValue;
                                }
                            } else {
                                // Default or First value
                                newData[key] = newValue;
                            }
                        } else {
                            // OVERWRITE Logic (Append Mode OFF)
                            newData[key] = newValue;
                        }
                    });

                    setTimeout(() => { if (onDataChange) onDataChange(newData); }, 0);
                    return newData;
                });
                alert(appendMode
                    ? 'Datos agregados correctamente (Tablas anexadas, Texto concatenado).'
                    : 'Datos extraídos correctamente (Sobreescritos).');
            } else {
                console.warn('No data found in response:', result);
                alert('La extracción finalizó pero no devolvió datos estructurados.');
            }
        } catch (error: any) {
            console.error('Error en extracción:', error);
            alert(`Error: ${error.message}`);
        } finally {
            setExtracting(false);
        }
    };

    const handleSave = async () => {
        if (!onSave) return;

        setSaving(true);
        try {
            await onSave(formData);
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event: any) => {
                    try {
                        const imported = JSON.parse(event.target.result);
                        setFormData(imported);
                        if (onDataChange) onDataChange(imported);
                    } catch (error) {
                        alert('Error al importar JSON');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    const handleExport = () => {
        const dataStr = JSON.stringify(formData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${mode === 'seed' ? 'seed' : 'project'}_data_${documentId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left: PDF Viewer */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-neutral-700">Documento Original</h3>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={handleImport}>
                            <Upload className="h-4 w-4 mr-1" /> Importar
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleExport}>
                            <Download className="h-4 w-4 mr-1" /> Exportar
                        </Button>
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden bg-neutral-100 flex flex-col" style={{ height: '700px' }}>
                    {!fileUrl ? (
                        <div className="flex-1 flex items-center justify-center text-neutral-400">
                            No hay documento cargado
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                <canvas ref={canvasRef} className="shadow-lg" />
                            </div>
                            <div className="bg-white border-t p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={prevPage} disabled={pageNum <= 1}>
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-sm text-neutral-600 font-medium min-w-[80px] text-center">
                                        Página {pageNum} / {totalPages || '--'}
                                    </span>
                                    <Button size="sm" variant="outline" onClick={nextPage} disabled={!pdfDoc || pageNum >= totalPages}>
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                    <div className="flex items-center gap-1 border-l pl-2 ml-2">
                                        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} title="Zoom Out">
                                            <ZoomOut className="h-4 w-4" />
                                        </Button>
                                        <span className="text-xs text-neutral-500 w-12 text-center">{Math.round(scale * 100)}%</span>
                                        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(3.0, s + 0.25))} title="Zoom In">
                                            <ZoomIn className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleExtractPage}
                                        disabled={extracting || !canvasRef.current}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        {extracting ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Extrayendo...
                                            </>
                                        ) : (
                                            <>
                                                <Bot className="h-4 w-4 mr-2" />
                                                Extraer esta página
                                            </>
                                        )}
                                    </Button>
                                    <div className="flex items-center space-x-2 bg-neutral-50 px-2 py-1 rounded border border-neutral-200">
                                        <input
                                            type="checkbox"
                                            id="appendMode"
                                            checked={appendMode}
                                            onChange={(e) => setAppendMode(e.target.checked)}
                                            className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <label htmlFor="appendMode" className="text-[10px] font-medium text-neutral-600 cursor-pointer select-none whitespace-nowrap">
                                            Anexar (Tablas/Texto)
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Right: Fields Form */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-neutral-700">Datos Extraídos</h3>
                    {mode === 'project' && onSave && (
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-1" />
                                    Guardar
                                </>
                            )}
                        </Button>
                    )}
                </div>

                <div className="border rounded-lg overflow-auto bg-white p-4" style={{ height: '700px' }}>
                    <div className="space-y-4">
                        {fields.map((field: any) => {
                            const value = formData[field.key_identifier];

                            if (field.field_type === 'structured_table' || field.field_type === 'table') {
                                return (
                                    <div key={field.key_identifier} className="p-4 rounded-lg border border-neutral-200 bg-white shadow-sm ring-1 ring-black/5">
                                        <div className="flex justify-between items-start mb-2">
                                            <label className="block text-sm font-semibold text-neutral-800">
                                                {field.name}
                                                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                            </label>
                                            <Badge variant="secondary" className="text-[10px]">Tabla</Badge>
                                        </div>
                                        <TableField
                                            currentValue={value || []}
                                            onChange={(newValue) => handleFieldChange(field.key_identifier, newValue)}
                                            fieldId={field.key_identifier}
                                            fixedHeaders={field.strict_headers ? JSON.parse(field.strict_headers) : undefined}
                                        />
                                    </div>
                                );
                            }

                            if (field.field_type === 'file') {
                                return (
                                    <div key={field.key_identifier} className="p-4 rounded-lg border border-neutral-200 bg-neutral-50 shadow-sm">
                                        <label className="block text-sm font-semibold text-neutral-700 mb-2">
                                            {field.name}
                                            {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                        </label>
                                        <FileUploadField
                                            currentValue={value}
                                            onChange={(newValue) => handleFieldChange(field.key_identifier, newValue)}
                                            fieldId={field.key_identifier}
                                            docId={documentId}
                                            projectId={effectiveProjectId}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <div key={field.key_identifier} className="p-4 rounded-lg border border-neutral-200 bg-neutral-50/30 hover:bg-white hover:border-emerald-200 transition-colors shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <label className="block text-sm font-semibold text-neutral-700">
                                            {field.name}
                                            {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                        </label>
                                        <Badge variant="outline" className="text-[10px] text-neutral-400 font-mono tracking-tighter">
                                            {field.key_identifier.slice(0, 15)}{field.key_identifier.length > 15 && '...'}
                                        </Badge>
                                    </div>
                                    <div className="relative group/field">
                                        <Textarea
                                            value={value || ''}
                                            onChange={(e) => handleFieldChange(field.key_identifier, e.target.value)}
                                            placeholder={`Ingrese ${field.name.toLowerCase()}`}
                                            className="pr-8 min-h-[80px] resize-y"
                                            rows={3}
                                        />
                                        {(value && String(value).length > 0) && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="absolute right-1 top-2 h-6 w-6 text-neutral-400 hover:text-blue-500 opacity-50 group-hover/field:opacity-100 transition-opacity bg-white/50 hover:bg-white"
                                                onClick={() => setViewField({ name: field.name, content: value })}
                                                title="Ver contenido completo"
                                            >
                                                <Eye className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                    {field.ai_instructions && (
                                        <p className="text-xs text-neutral-400 mt-1">{field.ai_instructions}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Debug Info */}
                    <div className="mt-4 p-2 bg-neutral-100 rounded text-xs border">
                        <details>
                            <summary className="cursor-pointer font-bold mb-2 text-neutral-500">Debug Info (Data vs Keys)</summary>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <strong>Form Data:</strong>
                                    <pre className="overflow-auto max-h-40 bg-white p-2 border mt-1">{JSON.stringify(formData, null, 2)}</pre>
                                </div>
                                <div>
                                    <strong>Expected Keys:</strong>
                                    <pre className="overflow-auto max-h-40 bg-white p-2 border mt-1">{JSON.stringify(fields.map((f: any) => f.key_identifier), null, 2)}</pre>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
                <Dialog open={!!viewField} onOpenChange={(open) => !open && setViewField(null)}>
                    <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Detalle: {viewField?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="whitespace-pre-wrap p-4 bg-neutral-50 rounded border overflow-auto flex-1 text-sm font-mono">
                            {viewField?.content}
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={() => setViewField(null)}>Cerrar</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
