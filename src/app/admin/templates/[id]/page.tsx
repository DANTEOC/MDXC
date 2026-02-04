'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import PizZip from 'pizzip';
import {
    ArrowLeft, Save, Loader2, RefreshCw, CheckCircle, Database
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Docxtemplater from 'docxtemplater';
import InspectModule from 'docxtemplater/js/inspect-module';

// Helper to inspect tags
// Note: In a real app we might want to move this to a utility
function getTemplateVariables(content: ArrayBuffer): string[] {
    const zip = new PizZip(content);
    const iModule = new InspectModule();
    const doc = new Docxtemplater(zip, {
        modules: [iModule],
        delimiters: { start: '{{', end: '}}' } // Standard delimiters
    });

    // We don't render, just inspect
    // @ts-ignore - getAllTags exists in inspect-module
    const tags = iModule.getAllTags();

    // Flatten tags logic usually gives us an object map or list
    // Simple extraction for now (InspectModule returns structured obj)
    // We need to traverse and extract keys. 
    // For MVP, allow the user to type if inspection fails, or assume simple keys.
    // Actually, InspectModule output is complex.

    // Let's rely on simple Regex for v1 if InspectModule is too heavy, 
    // but docxtemplater is safer for loops. 
    // Let's try to just capture the top-level keys for now.

    return Object.keys(tags);
}

export default function TemplateMappingPage() {
    const params = useParams();
    const router = useRouter();
    const [template, setTemplate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [variables, setVariables] = useState<any[]>([]); // From DB or Analysis
    const [docDefinitions, setDocDefinitions] = useState<any[]>([]);

    // Missing state variables correction
    const [selectedVariable, setSelectedVariable] = useState<any>(null);
    const [isMappingOpen, setIsMappingOpen] = useState(false);
    const [sourceType, setSourceType] = useState<string>('DOCUMENT');
    const [selectedDocDef, setSelectedDocDef] = useState<string>('');
    const [selectedField, setSelectedField] = useState<string>('');
    const [listMode, setListMode] = useState(false);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            // 1. Get Template Info
            const { data: tmpl } = await supabase
                .from('document_templates')
                .select('*')
                .eq('id', params.id)
                .single();

            if (tmpl) setTemplate(tmpl);

            // 2. Get Variables
            const { data: vars } = await supabase
                .from('template_variables')
                .select('*')
                .eq('template_id', params.id);

            // 3. Get Mappings (Separately to avoid Bad Request on bad relation)
            const { data: mappings } = await supabase
                .from('template_mappings')
                .select('*')
                .eq('template_id', params.id);

            // Merge mappings into variables
            if (vars) {
                const merged = vars.map((v: any) => ({
                    ...v,
                    mapping: mappings?.filter((m: any) => m.variable_name === v.variable_name) || []
                }));
                setVariables(merged);
            }

            // 4. Get Document Definitions
            const { data: defs } = await supabase
                .from('document_definitions')
                .select('*') // Select all to be safe, filtering columns might be causing issues on some strict setups
                .order('name');

            if (defs) setDocDefinitions(defs);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const analyzeTemplate = async () => {
        if (!template?.file_path) return;
        setAnalyzing(true);
        try {
            // Download file
            const { data, error } = await supabase.storage
                .from('templates')
                .download(template.file_path);

            if (error) throw error;

            const arrayBuffer = await data.arrayBuffer();
            const zip = new PizZip(arrayBuffer);
            const iModule = new InspectModule();
            const doc = new Docxtemplater(zip, {
                modules: [iModule],
                delimiters: { start: '{{', end: '}}' }
            });

            // @ts-ignore
            const tags = iModule.getAllTags();
            console.log('Detected Tags Object:', tags);

            const keys = new Set<string>();
            const traverse = (obj: any) => {
                for (const key in obj) {
                    keys.add(key);
                    if (typeof obj[key] === 'object') {
                        traverse(obj[key]);
                    }
                }
            };
            traverse(tags);
            console.log('Extracted Keys:', Array.from(keys));

            // Sync with DB (Batch Upsert to avoid 409 Conflicts)
            const newVariables = Array.from(keys).map(key => ({
                template_id: params.id,
                variable_name: key,
                description: 'Auto-detected'
            }));

            if (newVariables.length > 0) {
                const { error: upsertError } = await supabase
                    .from('template_variables')
                    .upsert(newVariables, {
                        onConflict: 'template_id,variable_name',
                        ignoreDuplicates: true
                    });

                if (upsertError) throw upsertError;
            }

            // Reload
            await loadData();
            alert('Análisis completo. Variables actualizadas.');

        } catch (error: any) {
            console.error('Analysis Error:', error);
            let msg = error.message || JSON.stringify(error);
            if (error.properties && error.properties.errors instanceof Array) {
                const details = error.properties.errors.map((e: any) => `- ${e.message}`).join('\n');
                msg = `Errores encontrados en la plantilla:\n${details}`;
            }
            alert(`Error al analizar plantilla:\n${msg}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const openMapping = (variable: any) => {
        setSelectedVariable(variable);
        // Load existing mapping if any
        if (variable.mapping && variable.mapping.length > 0) {
            const m = variable.mapping[0];
            setSourceType(m.source_type);
            setSelectedDocDef(m.source_document_definition_id || '');
            setSelectedField(m.source_field_key || '');
            setListMode(m.is_list || false);
        } else {
            // Defaults
            setSourceType('DOCUMENT');
            setSelectedDocDef('');
            setSelectedField('');
            setListMode(false);
        }
        setIsMappingOpen(true);
    };

    const saveMapping = async () => {
        if (!selectedVariable) return;

        try {
            // Delete existing
            await supabase
                .from('template_mappings')
                .delete()
                .eq('template_id', params.id)
                .eq('variable_name', selectedVariable.variable_name);

            // Insert new
            const { error } = await supabase
                .from('template_mappings')
                .insert({
                    template_id: params.id,
                    variable_name: selectedVariable.variable_name,
                    source_type: sourceType,
                    source_document_definition_id: sourceType === 'DOCUMENT' ? selectedDocDef : null,
                    source_field_key: selectedField,
                    is_list: listMode
                });

            if (error) throw error;

            setIsMappingOpen(false);
            loadData(); // Refresh to show checkmark

        } catch (error) {
            console.error(error);
            alert('Error al guardar mapeo');
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" asChild>
                    <Link href="/admin/templates">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Mapeo de Variables</h1>
                    <p className="text-sm text-neutral-500">{template?.name} ({template?.file_path})</p>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" onClick={analyzeTemplate} disabled={analyzing}>
                        {analyzing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Analizar / Escanear
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Variable List */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Variables Detectadas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {variables.length === 0 && (
                            <div className="text-center py-10 text-neutral-400">
                                No hay variables. Haz clic en "Analizar" para escanear el documento.
                            </div>
                        )}
                        {variables.map((v) => (
                            <div key={v.id} className="flex items-start justify-between p-4 border rounded-lg bg-neutral-50">
                                <div>
                                    <div className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded inline-block">
                                        {`{{${v.variable_name}}}`}
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-1">{v.description}</p>

                                    {v.mapping?.length > 0 ? (
                                        <div className="mt-2 text-sm text-emerald-700 flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" />
                                            Mapeado a: <span className="font-semibold">
                                                {v.mapping[0].source_type === 'DOCUMENT'
                                                    ? docDefinitions.find(d => d.id === v.mapping[0].source_document_definition_id)?.name
                                                    : v.mapping[0].source_type}
                                                {' -> '}
                                                {v.mapping[0].source_field_key}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-sm text-amber-600">
                                            ⚠️ Sin mapear
                                        </div>
                                    )}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => openMapping(v)}>Configurar</Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Info / Help */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">¿Cómo funciona?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-600 space-y-2">
                            <p>1. Sube tu plantilla Word con variables entre llaves dobles, ejemplo: <code>{'{{nombre}}'}</code>.</p>
                            <p>2. Haz clic en <strong>Analizar</strong> para detectar las variables automáticamente.</p>
                            <p>3. Configura cada variable indicando de qué campo de la base de datos debe tomar su valor.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Mapping Modal */}
            <Dialog open={isMappingOpen} onOpenChange={setIsMappingOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Configurar Variable: {selectedVariable?.variable_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">

                        {/* Source Type Selector */}
                        <div className="space-y-2">
                            <Label>Fuente de Datos</Label>
                            <div className="flex gap-2">
                                {['PROJECT', 'DOCUMENT', 'SYSTEM'].map((type) => (
                                    <Button
                                        key={type}
                                        variant={sourceType === type ? 'default' : 'outline'}
                                        onClick={() => setSourceType(type)}
                                        className="flex-1"
                                    >
                                        {type === 'PROJECT' && 'Proyecto'}
                                        {type === 'DOCUMENT' && 'Documento'}
                                        {type === 'SYSTEM' && 'Sistema'}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Document Selector (Only if DOCUMENT) */}
                        {sourceType === 'DOCUMENT' && (
                            <div className="space-y-2">
                                <Label>Tipo de Documento</Label>
                                <select
                                    className="w-full p-2 border rounded-md"
                                    value={selectedDocDef}
                                    onChange={(e) => {
                                        setSelectedDocDef(e.target.value);
                                        setSelectedField(''); // Reset field
                                    }}
                                >
                                    <option value="">Seleccione un documento...</option>
                                    {docDefinitions.map(def => (
                                        <option key={def.id} value={def.id}>{def.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Field Selector */}
                        <div className="space-y-2">
                            <Label>Campo / Valor</Label>
                            {sourceType === 'DOCUMENT' && selectedDocDef ? (
                                <select
                                    className="w-full p-2 border rounded-md"
                                    value={selectedField}
                                    onChange={(e) => setSelectedField(e.target.value)}
                                >
                                    <option value="">Seleccione un campo...</option>
                                    {docDefinitions.find(d => d.id === selectedDocDef)?.fields?.map((f: any) => (
                                        <option key={f.key} value={f.key}>{f.label || f.key} ({f.type})</option>
                                    ))}
                                </select>
                            ) : sourceType === 'PROJECT' ? (
                                <select
                                    className="w-full p-2 border rounded-md"
                                    value={selectedField}
                                    onChange={(e) => setSelectedField(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    <option value="client_name">Cliente</option>
                                    <option value="project_name">Nombre del Proyecto</option>
                                    <option value="manufacturer_name">Fabricante</option>
                                    <option value="created_at">Fecha Creación</option>
                                </select>
                            ) : (
                                <select
                                    className="w-full p-2 border rounded-md"
                                    value={selectedField}
                                    onChange={(e) => setSelectedField(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    <option value="current_date">Fecha Actual</option>
                                    <option value="user_name">Usuario Actual</option>
                                </select>
                            )}
                        </div>

                        {/* Advanced Options */}
                        <div className="flex items-center space-x-2 pt-4 border-t">
                            <input
                                type="checkbox"
                                id="listMode"
                                checked={listMode}
                                onChange={(e) => setListMode(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="listMode">Es una lista/tabla (Usar para bucles)</Label>
                        </div>

                        <Button onClick={saveMapping} className="w-full bg-emerald-600 hover:bg-emerald-700">
                            <Save className="mr-2 h-4 w-4" /> Guardar Mapeo
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
