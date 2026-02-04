'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, FileText, Download, Loader2 } from 'lucide-react';
import { generateDocx } from '@/lib/docx-generator';

export default function GenerateDocumentPage() {
    const { id: projectId } = useParams();
    const router = useRouter();
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [projectData, setProjectData] = useState<any>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function loadData() {
            // 1. Load Templates
            const { data: tmpls } = await supabase
                .from('document_templates')
                .select('*')
                .eq('engine_type', 'DOCX');
            if (tmpls) setTemplates(tmpls);

            // 2. Load Deep Project Data
            // We need to fetch EVERYTHING to pass to the template
            const { data: proj } = await supabase
                .from('projects')
                .select(`
                    *,
                    client:companies!client_id(*),
                    manufacturer:companies!manufacturer_id(*)
                `)
                .eq('id', projectId)
                .single();

            // 3. Load Documents & Extracted Data
            const { data: docs } = await supabase
                .from('project_documents')
                .select(`
                    *,
                    definition:document_definitions(name, key_identifier)
                `)
                .eq('project_id', projectId);

            // Flatten extracted data for easy access?
            // Strategy: Create a "Context Object"
            // context = { project: {...}, client: {...}, documents: [With Data] }
            if (proj && docs) {
                const fullContext = {
                    project: proj,
                    client: proj.client,
                    manufacturer: proj.manufacturer,
                    documents: docs.map((d: any) => ({
                        name: d.definition.name,
                        key: d.definition.key_identifier,
                        status: d.status,
                        data: d.extracted_data // AI Data access: {{documents.0.data.passport_number}}
                    }))
                };
                setProjectData(fullContext);
            }

            setLoading(false);
        }
        loadData();
    }, [projectId]);

    const handleGenerate = async () => {
        if (!selectedTemplate || !projectData) return;
        setGenerating(true);
        try {
            // 1. Get Template URL
            const template = templates.find(t => t.id === selectedTemplate);
            if (!template) return;

            const { data: urlData } = await supabase
                .storage
                .from('templates')
                .createSignedUrl(template.file_path, 60);

            if (!urlData?.signedUrl) throw new Error('Could not get template URL');

            // 2. Generate
            await generateDocx(
                urlData.signedUrl,
                projectData,
                `${template.name}_${projectData.client.name}.docx`
            );

        } catch (error) {
            console.error(error);
            alert('Error al generar el documento');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Generar Documento</h1>
                    <p className="text-neutral-500">Crea documentos oficiales usando plantillas Word y datos del proyecto.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Selection */}
                <Card>
                    <CardHeader>
                        <CardTitle>1. Selecciona Plantilla</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elige un formato..." />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-800">
                            <strong>Importante:</strong> Asegúrate de que todos los datos necesarios en la plantilla estén validados en el expediente.
                            Los campos vacíos aparecerán en blanco.
                        </div>

                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700 h-12"
                            onClick={handleGenerate}
                            disabled={!selectedTemplate || generating}
                        >
                            {generating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                            Generar DOCX
                        </Button>
                    </CardContent>
                </Card>

                {/* Data Preview (Simplified) */}
                <Card>
                    <CardHeader>
                        <CardTitle>2. Datos Disponibles</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[400px] overflow-auto bg-neutral-50 p-4 font-mono text-xs rounded-b-lg border-t">
                        <pre>
                            {JSON.stringify(projectData, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
