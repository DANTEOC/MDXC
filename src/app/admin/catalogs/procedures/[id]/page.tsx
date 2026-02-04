'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, ArrowLeft, Trash2, FileInput, FileOutput, Search, CheckCircle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';

export default function ProcedureDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [procedure, setProcedure] = useState<any>(null);
    const [linkedDocs, setLinkedDocs] = useState<any[]>([]);
    const [availableDocs, setAvailableDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        if (params.id) {
            loadData();
        }
    }, [params.id]);

    const loadData = async () => {
        setLoading(true);
        // Load Procedure Info
        const { data: proc } = await supabase.from('procedures').select('*').eq('id', params.id).single();
        if (proc) setProcedure(proc);

        // Load Linked Docs
        const { data: links } = await supabase
            .from('procedure_documents')
            .select('*, document:document_definitions(*)')
            .eq('procedure_id', params.id)
            .order('created_at');

        if (links) setLinkedDocs(links);

        // Load all active document definitions
        const { data: allDocs } = await supabase
            .from('document_definitions')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (allDocs) setAvailableDocs(allDocs);
        setLoading(false);
    };

    const handleAdd = async (docId: string, type: 'INPUT' | 'OUTPUT') => {
        setProcessing(`add-${docId}`);
        try {
            const { error } = await supabase.from('procedure_documents').insert({
                procedure_id: params.id,
                document_definition_id: docId,
                relation_type: type,
                is_mandatory: type === 'INPUT' // Default mandatory for inputs
            });

            if (error) throw error;
            await loadData();
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setProcessing(null);
        }
    };

    const handleRemove = async (linkId: string) => {
        console.log('Attempting to delete link:', linkId);
        setProcessing(`rem-${linkId}`);
        if (!confirm('¿Quitar este documento del trámite?')) {
            setProcessing(null);
            return;
        }
        const { error } = await supabase.from('procedure_documents').delete().eq('id', linkId);

        if (error) {
            console.error('Delete error:', error);
            alert('Error al eliminar: ' + error.message);
        } else {
            await loadData();
        }
        setProcessing(null);
    };

    // Filter Logic
    const getFilteredAvailable = (currentLinks: any[]) => {
        const currentIds = new Set(currentLinks.map((l: any) => l.document_definition_id));
        return availableDocs.filter(d =>
            !currentIds.has(d.id) &&
            (d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.key?.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    };

    const renderDualColumn = (type: 'INPUT' | 'OUTPUT', icon: any, title: string) => {
        const currentLinks = linkedDocs.filter(d => d.relation_type === type);
        const available = getFilteredAvailable(currentLinks);

        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                {/* Available Column */}
                <Card className="flex flex-col h-full bg-neutral-50 border-neutral-300">
                    <CardHeader className="bg-white border-b rounded-t-xl py-3 px-4">
                        <div className="flex justify-between items-center mb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-neutral-600">
                                <Search className="h-4 w-4" /> {type === 'INPUT' ? 'Catálogo de Documentos semilla' : 'Catálogo Plantillas finales'} ({available.length})
                            </CardTitle>
                        </div>
                        <Input
                            placeholder="Buscar documento..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-8 text-sm"
                        />
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-2 space-y-2">
                        {available.map(doc => (
                            <div key={doc.id} className="bg-white p-2 rounded border hover:border-blue-400 flex justify-between items-center group transition-all">
                                <div>
                                    <div className="text-sm font-medium text-neutral-800">{doc.name}</div>
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1">{doc.key}</Badge>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-7 p-0 shrink-0 bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                    onClick={() => handleAdd(doc.id, type)}
                                    disabled={!!processing}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Selected Column */}
                <Card className="flex flex-col h-full bg-white border-emerald-200 shadow-sm">
                    <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 rounded-t-xl py-3 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-800">
                            {icon} {title} ({currentLinks.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-2 space-y-2">
                        {currentLinks.map(link => (
                            <div key={link.id} className="bg-white p-3 rounded border border-neutral-100 shadow-sm flex justify-between items-center hover:border-red-200 group transition-all">
                                <div>
                                    <div className="text-sm font-medium text-neutral-900">{link.document.name}</div>
                                    <div className="flex gap-2 mt-1">
                                        <Badge variant="outline" className="text-[10px] text-neutral-500">{link.document.key}</Badge>
                                        {link.is_mandatory && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Obligatorio</Badge>}
                                    </div>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleRemove(link.id)}
                                    disabled={!!processing}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        {currentLinks.length === 0 && (
                            <div className="text-center py-12 text-neutral-400 italic">
                                No se han asignado documentos a esta sección.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/catalogs/procedures">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">
                        Configuración: <span className="text-emerald-700">{procedure?.name || 'Cargando...'}</span>
                    </h1>
                    <p className="text-neutral-500">Gestiona los requisitos de entrada y las plantillas de salida mediante las pestañas.</p>
                </div>
            </div>

            <Tabs defaultValue="input" className="w-full">
                <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-b rounded-none mb-6">
                    <TabsTrigger
                        value="input"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 py-3 px-6 text-base"
                    >
                        <FileInput className="h-4 w-4 mr-2" /> Documentos (Requisitos)
                    </TabsTrigger>
                    <TabsTrigger
                        value="output"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:text-purple-600 py-3 px-6 text-base"
                    >
                        <FileOutput className="h-4 w-4 mr-2" /> Plantillas (Entregables)
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="input">
                    {renderDualColumn('INPUT', <CheckCircle className="h-4 w-4 text-emerald-600" />, 'Documentos Requeridos')}
                </TabsContent>

                <TabsContent value="output">
                    {renderDualColumn('OUTPUT', <FileOutput className="h-4 w-4 text-purple-600" />, 'Plantillas de Salida')}
                </TabsContent>
            </Tabs>
        </div>
    );
}
