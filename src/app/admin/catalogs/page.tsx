'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileCode, FileText, Settings, Database, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function CatalogsPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900">Catálogos del Sistema</h1>
                <p className="text-neutral-500">Configuración de tablas maestras y definiciones.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Field Types Catalog */}
                <Link href="/admin/catalogs/field-types" className="group">
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-emerald-500">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium">Tipos de Campos</CardTitle>
                            <FileCode className="h-5 w-5 text-neutral-500 group-hover:text-emerald-600 transition-colors" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-neutral-500 mb-4">
                                Define los tipos de datos (Texto, Archivo, Lista) disponibles para la creación de documentos.
                            </p>
                            <div className="text-xs font-bold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Gestionar <ArrowRight className="h-3 w-3" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                {/* Document Definitions Catalog */}
                <Link href="/admin/catalogs/documents" className="group">
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium">Tipos de Documentos</CardTitle>
                            <FileText className="h-5 w-5 text-neutral-500 group-hover:text-blue-600 transition-colors" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-neutral-500 mb-4">
                                Configura los documentos del sistema (INE, Facturas) y sus <strong>Modelos de Extracción</strong>.
                            </p>
                            <div className="text-xs font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Configurar <ArrowRight className="h-3 w-3" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                {/* Procedures Catalog */}
                <Link href="/admin/catalogs/procedures" className="group">
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-purple-500">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium">Trámites y Gestiones</CardTitle>
                            <Settings className="h-5 w-5 text-neutral-500 group-hover:text-purple-600 transition-colors" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-neutral-500 mb-4">
                                Define flujos de trabajo, Requisitos (Inputs) y Entregables (Outputs) para la operación.
                            </p>
                            <div className="text-xs font-bold text-purple-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Administrar <ArrowRight className="h-3 w-3" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>

            </div>
        </div>
    );
}
