'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useParams } from 'next/navigation';
import { DocumentUploadModal } from '@/components/documents/DocumentUploadModal';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectCommunication } from '@/components/projects/ProjectCommunication';
import { ProjectTasks } from '@/components/projects/ProjectTasks';
import { ProjectVault } from '@/components/projects/ProjectVault';

export default function ProjectDetailPage() {
    const { id } = useParams();
    const [project, setProject] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function loadData() {
            if (!id) return;

            // Get Current User Role
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (profile) setCurrentUserRole(profile.role);
            }

            // 1. Get Project Details
            const { data: proj } = await supabase
                .from('projects')
                .select(`*, client:companies!client_id(name)`)
                .eq('id', id)
                .single();

            setProject(proj);

            // 2. Get Document Slots
            const { data: docs } = await supabase
                .from('project_documents')
                .select(`
          *,
          definition:document_definitions(name, description)
        `)
                .eq('project_id', id)
                .order('created_at');

            if (docs) setDocuments(docs);
            setLoading(false);
        }
        loadData();
    }, [id]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'VALID': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="w-3 h-3 mr-1" /> Validado</Badge>;
            case 'REVIEW_NEEDED': return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50"><Clock className="w-3 h-3 mr-1" /> En Revisión</Badge>;
            case 'MISSING': return <Badge variant="outline" className="text-neutral-400 border-dashed border-neutral-300">Pendiente</Badge>;
            case 'EXPIRED': return <Badge className="bg-red-50 text-red-700 hover:bg-red-50"><AlertTriangle className="w-3 h-3 mr-1" /> Vencido</Badge>;
            default: return <Badge variant="secondary">{status}</Badge>;
        }
    };

    if (loading) return <div>Cargando proyecto...</div>;
    if (!project) return <div>Proyecto no encontrado services.</div>;

    return (
        <div className="flex flex-col gap-8">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-neutral-500 mb-1">
                            <span>{project.client?.name}</span>
                            <span>/</span>
                            <span className="font-mono">{project.id.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-3xl font-bold text-neutral-900">{project.name}</h1>
                    </div>
                    {['ADMIN', 'SUPERVISOR'].includes(currentUserRole || '') && (
                        <div className="flex gap-2">
                            <Link href={`/projects/${project.id}/generate`}>
                                <Button variant="outline" className="gap-2">
                                    <FileText className="h-4 w-4" /> Generar Documento
                                </Button>
                            </Link>
                            <Button variant="outline">Editar Detalles</Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">Finalizar Trámite</Button>
                        </div>
                    )}
                </div>
            </div>

            <Separator />

            <Tabs defaultValue="documents" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="documents">Expediente Digital</TabsTrigger>
                    <TabsTrigger value="vault">Bóveda Digital</TabsTrigger>
                    <TabsTrigger value="chat">Comunicación</TabsTrigger>
                    <TabsTrigger value="tasks">Tareas y Pendientes</TabsTrigger>
                </TabsList>

                <TabsContent value="documents" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-emerald-600" />
                            Documentos Requeridos
                        </h2>
                        <div className="text-sm text-neutral-500">
                            Progreso: {Math.round((documents.filter(d => d.status === 'VALID').length / documents.length) * 100) || 0}%
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className="group flex flex-col md:flex-row items-center justify-between p-4 bg-white border border-neutral-200 rounded-xl hover:shadow-sm hover:border-emerald-300 transition-all"
                            >
                                {/* Doc Info */}
                                <div className="flex items-center gap-4 flex-1 w-full md:w-auto">
                                    <div className={`
                    h-10 w-10 rounded-lg flex items-center justify-center
                    ${doc.status === 'VALID' ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-400'}
                    `}>
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-neutral-900">{doc.definition.name}</h4>
                                        <p className="text-xs text-neutral-500">{doc.definition.description || 'Requerido para el trámite'}</p>
                                    </div>
                                </div>

                                {/* Status & Actions */}
                                <div className="flex items-center gap-4 mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                                    {/* Traffic Light Expiry Info */}
                                    {doc.expiry_date && (
                                        <div className="text-right mr-4">
                                            <div className="text-xs text-neutral-400">Vence:</div>
                                            <div className={`text-sm font-medium ${new Date(doc.expiry_date) < new Date() ? 'text-red-600' : 'text-neutral-700'}`}>
                                                {doc.expiry_date}
                                            </div>
                                        </div>
                                    )}

                                    {getStatusBadge(doc.status)}

                                    {doc.status === 'MISSING' || doc.status === 'REJECTED' ? (
                                        <DocumentUploadModal
                                            projectId={project.id}
                                            documentId={doc.id}
                                            documentName={doc.definition.name}
                                        />
                                    ) : (
                                        <div className="flex gap-2">
                                            <Link href={`/projects/${project.id}/validate/${doc.id}`}>
                                                <Button size="sm" variant={doc.status === 'REVIEW_NEEDED' ? 'default' : 'ghost'} className={doc.status === 'REVIEW_NEEDED' ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200" : ""}>
                                                    {doc.status === 'REVIEW_NEEDED' ? (
                                                        <>
                                                            <FileText className="h-4 w-4 mr-2" /> Revisar Extracción
                                                        </>
                                                    ) : 'Ver Detalles'}
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="chat" className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2">
                            <ProjectCommunication projectId={project.id} />
                        </div>
                        <div className="md:col-span-1 border rounded-lg p-4 bg-neutral-50">
                            <h3 className="font-semibold text-sm mb-2">Miembros del Proyecto</h3>
                            <div className="text-sm text-neutral-500">
                                Aquí se listarán los participantes (Analistas, Clientes).
                                TODO: Integrar lista de miembros.
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="tasks">
                    <ProjectTasks projectId={project.id} />
                </TabsContent>

                <TabsContent value="vault">
                    <ProjectVault projectId={project.id} currentUserRole={currentUserRole} />
                </TabsContent>

            </Tabs>
        </div >
    );
}
