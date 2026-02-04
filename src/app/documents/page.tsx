import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileText, Settings, Database } from 'lucide-react';

export default function DocumentsHubPage() {
    return (
        <div className="flex flex-col gap-8">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-800">
                    Gestión Documental
                </h1>
                <p className="text-sm text-neutral-500">
                    Administra el repositorio, las definiciones y los catálogos.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card for Definitions (Phase 2) */}
                <div className="p-6 rounded-xl border border-neutral-200 bg-white shadow-sm flex flex-col justify-between gap-4 group hover:border-emerald-500 transition-colors">
                    <div className="space-y-2">
                        <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Database className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 group-hover:text-emerald-700">Catálogo de Definiciones</h3>
                        <p className="text-sm text-neutral-500">
                            Configura los tipos de documentos, campos a extraer y reglas de vigencia (El Cerebro).
                        </p>
                    </div>
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/documents/definitions">Administrar Catálogo</Link>
                    </Button>
                </div>

                {/* Card for Vault (Phase 3 Placeholder) */}
                <div className="p-6 rounded-xl border border-neutral-200 bg-neutral-50 shadow-sm flex flex-col justify-between gap-4 opacity-75">
                    <div className="space-y-2">
                        <div className="h-10 w-10 rounded-lg bg-neutral-200 text-neutral-500 flex items-center justify-center">
                            <FileText className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900">Bóveda Digital</h3>
                        <p className="text-sm text-neutral-500">
                            Repositorio central de documentos digitalizados (Próximamente Fase 3).
                        </p>
                    </div>
                    <Button disabled variant="secondary" className="w-full">
                        Próximamente
                    </Button>
                </div>
            </div>
        </div>
    );
}
