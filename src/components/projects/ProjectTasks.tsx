'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckCircle, Circle, Clock } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TasksProps {
    projectId: string;
}

export function ProjectTasks({ projectId }: TasksProps) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM');

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        if (!projectId) return;
        loadTasks();
    }, [projectId]);

    async function loadTasks() {
        const { data, error } = await supabase
            .from('tasks')
            .select(`*, assigned:profiles!assigned_to(first_name)`)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading tasks:', error);
        }

        if (data) setTasks(data);
    }

    const createTask = async () => {
        if (!newTaskTitle.trim()) return;

        const { data, error } = await supabase.from('tasks').insert({
            project_id: projectId,
            title: newTaskTitle,
            priority: newTaskPriority,
            status: 'TODO'
        }).select();

        if (error) {
            console.error('Error creating task:', error);
            alert('Error al crear la tarea: ' + error.message);
            return;
        }

        setNewTaskOpen(false);
        setNewTaskTitle('');
        loadTasks();
    };

    const toggleStatus = async (task: any) => {
        const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
        await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
        loadTasks();
    };

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'URGENT': return 'text-red-600 bg-red-50 border-red-200';
            case 'HIGH': return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'MEDIUM': return 'text-blue-600 bg-blue-50 border-blue-200';
            default: return 'text-neutral-500 bg-neutral-100 border-neutral-200';
        }
    };

    return (
        <Card className="h-full min-h-[500px] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-3 border-b">
                <CardTitle className="text-sm font-medium">Lista de Tareas</CardTitle>
                <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-2">
                            <Plus className="h-3 w-3" /> Nueva Tarea
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Crear Tarea</DialogTitle>
                            <div className="text-sm text-neutral-500">
                                Llene los datos para agregar una nueva tarea al proyecto.
                            </div>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Título de la tarea</Label>
                                <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Ej: Revisar vigencia de pasaporte..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Prioridad</Label>
                                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="LOW">Baja</SelectItem>
                                        <SelectItem value="MEDIUM">Media</SelectItem>
                                        <SelectItem value="HIGH">Alta</SelectItem>
                                        <SelectItem value="URGENT">Urgente</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={createTask} className="w-full bg-emerald-600">Guardar Tarea</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-neutral-100">
                    {tasks.length === 0 && (
                        <div className="p-8 text-center text-neutral-400 text-sm">
                            No hay tareas pendientes.
                        </div>
                    )}
                    {tasks.map((task) => (
                        <div key={task.id} className="p-4 flex items-start gap-3 hover:bg-neutral-50 transition-colors group">
                            <button onClick={() => toggleStatus(task)} className="mt-1 text-neutral-400 hover:text-emerald-600">
                                {task.status === 'DONE' ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}
                            </button>
                            <div className="flex-1">
                                <div className={`text-sm font-medium ${task.status === 'DONE' ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                                    {task.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className={`text-[10px] h-5 px-1 ${getPriorityColor(task.priority)}`}>
                                        {task.priority}
                                    </Badge>
                                    {task.assigned?.first_name && (
                                        <span className="text-[10px] text-neutral-400">Asignado a: {task.assigned.first_name}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
