'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileText, Loader2, Download, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

// Utility to safely access nested properties
function getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return '';
    return path.split('.').reduce((prev, curr) => {
        // Handle array syntax like items[0]
        if (curr.includes('[') && curr.includes(']')) {
            const [key, indexPart] = curr.split('[');
            const index = parseInt(indexPart.replace(']', ''));
            return prev?.[key]?.[index];
        }
        return prev?.[curr];
    }, obj);
}

export default function ReportGenerationPage() {
    const params = useParams();
    const router = useRouter();
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState<string | null>(null);
    const [project, setProject] = useState<any>(null);
    const [userName, setUserName] = useState<string>('');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            // 0. Get Current User Name
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .single();
                if (profile) setUserName(profile.full_name || user.email || 'Admin');
            }

            // 1. Load Templates
            const { data: tmplData } = await supabase
                .from('document_templates')
                .select('*')
                .order('name');
            if (tmplData) setTemplates(tmplData);

            // 2. Load Project Context
            const { data: projData } = await supabase
                .from('projects')
                .select(`
                    *,
                    client:companies!client_id(name),
                    manufacturer:companies!manufacturer_id(name)
                `)
                .eq('id', params.id)
                .single();
            if (projData) setProject(projData);

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    const handleGenerate = async (templateId: string, templatePath: string, templateName: string) => {
        setGenerating(templateId);
        try {
            // 1. Fetch Mappings
            const { data: mappings } = await supabase
                .from('template_mappings')
                .select('*')
                .eq('template_id', templateId);

            if (!mappings || mappings.length === 0) {
                alert('Esta plantilla no tiene variables mapeadas.');
                setGenerating(null);
                return;
            }

            // 2. Prepare Data Object
            const finalData: Record<string, any> = {};

            // Fetch Documents
            const { data: projDocs } = await supabase
                .from('project_documents')
                .select('document_definition_id, content, created_at')
                .eq('project_id', params.id)
                .order('created_at', { ascending: false });

            for (const m of mappings) {
                let value: any = '';

                if (m.source_type === 'SYSTEM') {
                    if (m.source_field_key === 'current_date') value = new Date().toLocaleDateString();
                    if (m.source_field_key === 'user_name') value = userName || 'Usuario Desconocido';
                }
                else if (m.source_type === 'PROJECT') {
                    // Map common project fields
                    if (m.source_field_key === 'project_name') value = project?.title || project?.name || 'Sin Título';
                    else if (m.source_field_key === 'client_name') value = project?.client?.name || 'Cliente Desconocido';
                    else if (m.source_field_key === 'manufacturer_name') value = project?.manufacturer?.name || 'Fabricante Desconocido';
                    else if (m.source_field_key === 'created_at') {
                        const date = new Date(project?.created_at);
                        value = !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Fecha Inválida';
                    }
                    else value = getNestedValue(project, m.source_field_key);
                }
                else if (m.source_type === 'DOCUMENT') {
                    // Find the latest document of this definition
                    const sourceDoc = projDocs?.find(d => d.document_definition_id === m.source_document_definition_id);
                    if (sourceDoc && sourceDoc.content) {
                        try {
                            const content = typeof sourceDoc.content === 'string' ? JSON.parse(sourceDoc.content) : sourceDoc.content;
                            // Extract field
                            // If is_list, we might pass the whole array
                            if (m.is_list) {
                                // For tables/loops
                                value = getNestedValue(content, m.source_field_key) || [];
                            } else {
                                value = getNestedValue(content, m.source_field_key);
                            }
                        } catch (e) {
                            console.error('Error parsing content', e);
                        }
                    } else {
                        // Document missing
                        console.warn(`Missing document for mapping: ${m.variable_name}`);
                    }
                }

                if (value === undefined || value === null || value === '') {
                    // warn?
                    // missingVars.push(m.variable_name);
                }

                finalData[m.variable_name] = value;
            }

            // 3. Download Template
            const { data: blob, error: dlError } = await supabase.storage
                .from('templates')
                .download(templatePath);

            if (dlError) throw dlError;

            // 4. Render with Docxtemplater
            const arrayBuffer = await blob.arrayBuffer();
            const zip = new PizZip(arrayBuffer);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' }
            });

            doc.render(finalData);

            // 5. Output
            const out = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            saveAs(out, `Reporte_${templateName}_${project?.title || 'Draft'}.docx`);

        } catch (error: any) {
            console.error('Error generating:', error);
            let msg = error.message || JSON.stringify(error);
            if (error.properties && error.properties.errors instanceof Array) {
                const details = error.properties.errors.map((e: any) => `- ${e.message}`).join('\n');
                msg = `Errores en la plantilla:\n${details}`;
            }
            alert(`Error al generar reporte:\n${msg}`);
        } finally {
            setGenerating(null);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" asChild>
                    <Link href={`/admin/projects/${params.id}`}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Volver al Proyecto
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold text-neutral-900">Generar Reporte</h1>
            </div>

            <p className="text-neutral-500">Seleccione un formato de reporte. El sistema completará la información automáticamente.</p>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-neutral-400" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map((template) => (
                        <Card
                            key={template.id}
                            className="hover:border-blue-400 hover:shadow-md transition-all cursor-pointer border-neutral-200 bg-white group"
                            onClick={() => !generating && handleGenerate(template.id, template.file_path, template.name)}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-3 text-neutral-700 group-hover:text-blue-600 transition-colors text-base">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <span>{template.name}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-neutral-500 mb-6 line-clamp-2 h-10">
                                    {template.description || 'Formato estándar'}
                                </p>
                                <Button
                                    className="w-full bg-blue-600 text-white hover:bg-blue-700"
                                    disabled={generating === template.id}
                                >
                                    {generating === template.id ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-4 w-4 mr-2" /> Descargar
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                    {templates.length === 0 && (
                        <div className="col-span-full text-center py-12 text-neutral-500 bg-neutral-50 rounded-lg border border-dashed">
                            No hay plantillas de reporte configuradas.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
