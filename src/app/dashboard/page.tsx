import { Button } from "@/components/ui/button";

export default function DashboardPage() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-800">DASHBOARD</h1>
                <div className="flex gap-4">
                    <Button variant="outline">Filtrar</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">Nuevo Proyecto</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Placeholder Stats Cards */}
                {[
                    { label: 'Proyectos Activos', value: '12', color: 'bg-blue-50 text-blue-700' },
                    { label: 'Documentos Pendientes', value: '5', color: 'bg-amber-50 text-amber-700' },
                    { label: 'Tareas Urgentes', value: '3', color: 'bg-red-50 text-red-700' }
                ].map((stat) => (
                    <div key={stat.label} className="p-6 rounded-xl border border-neutral-100 shadow-sm bg-white flex flex-col gap-2">
                        <span className="text-sm font-medium text-neutral-500">{stat.label}</span>
                        <span className={`text-4xl font-light ${stat.color.split(' ')[1]}`}>{stat.value}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 h-[400px] flex items-center justify-center text-neutral-400">
                Gráfica de Rendimiento (Placeholder)
            </div>
        </div>
    );
}
