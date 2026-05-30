'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, UserX, UserCheck, Edit, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Create User State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newUser, setNewUser] = useState({
        email: '', password: '', first_name: '', last_name: '', role: 'ANALYST', company_id: ''
    });

    // Edit User State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [updating, setUpdating] = useState(false);

    // Companies for selection
    const [companies, setCompanies] = useState<any[]>([]);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        checkAdmin();
        loadData();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.push('/login');

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'ADMIN') {
            alert('Acceso denegado. Solo administradores.');
            router.push('/dashboard');
        }
    };

    const loadData = async () => {
        setLoading(true);
        // Load Users
        const { data: profiles } = await supabase
            .from('profiles')
            .select(`
                *,
                company:companies(name)
            `)
            .order('created_at', { ascending: false });

        if (profiles) setUsers(profiles);

        // Load Companies (for dropdown)
        const { data: comps } = await supabase
            .from('companies')
            .select('id, name')
            .order('name');

        if (comps) setCompanies(comps);
        setLoading(false);
    };

    const handleCreateUser = async () => {
        if (!newUser.email || !newUser.password || !newUser.first_name || !newUser.last_name) {
            return alert('Completa los campos obligatorios');
        }
        setCreating(true);

        try {
            // Get Session Token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No session');

            // Direct Fetch for Debugging
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newUser)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Error ${response.status}: ${response.statusText}`);
            }

            alert('Usuario creado exitosamente');
            setIsCreateOpen(false);
            setNewUser({ email: '', password: '', first_name: '', last_name: '', role: 'ANALYST', company_id: '' });
            await loadData();
        } catch (error: any) {
            console.error("Create User Fetch Error:", error);
            alert('Error creando usuario: ' + error.message);
        } finally {
            setCreating(false);
        }
    };

    const handleEditClick = (user: any) => {
        setEditingUser({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            company_id: user.company_id
        });
        setIsEditOpen(true);
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        setUpdating(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    first_name: editingUser.first_name,
                    last_name: editingUser.last_name,
                    role: editingUser.role,
                    company_id: editingUser.company_id
                })
                .eq('id', editingUser.id);

            if (error) throw error;

            alert('Usuario actualizado exitosamente');
            setIsEditOpen(false);
            setEditingUser(null);
            await loadData();
        } catch (error: any) {
            alert('Error actualizando usuario: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
        if (!confirm(`¿Confirmas cambiar el estatus a ${newStatus}?`)) return;

        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) alert('Error actualizando estatus');
        else loadData();
    };

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900">Gestión de Usuarios</h1>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-emerald-600 gap-2">
                            <Plus className="h-4 w-4" /> Nuevo Usuario
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Registrar Nuevo Usuario</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Apellidos</Label>
                                <Input value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })} />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Email</Label>
                                <Input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Contraseña</Label>
                                <Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Rol</Label>
                                <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Administrador</SelectItem>
                                        <SelectItem value="DIRECTOR">Director</SelectItem>
                                        <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                                        <SelectItem value="ANALYST">Analista</SelectItem>
                                        <SelectItem value="CLIENT_ADMIN">Cliente (Admin)</SelectItem>
                                        <SelectItem value="CLIENT_USER">Cliente (Usuario)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Empresa / Cliente (Opcional si es staff)</Label>
                                <Select value={newUser.company_id} onValueChange={v => setNewUser({ ...newUser, company_id: v })}>
                                    <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                                    <SelectContent>
                                        {companies.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button onClick={handleCreateUser} disabled={creating} className="w-full bg-emerald-600">
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Usuario
                        </Button>
                    </DialogContent>
                </Dialog>

                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogContent className="max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Editar Usuario</DialogTitle>
                        </DialogHeader>
                        {editingUser && (
                            <div className="grid grid-cols-2 gap-4 py-4">
                                <div className="space-y-2">
                                    <Label>Nombre</Label>
                                    <Input value={editingUser.first_name || ''} onChange={e => setEditingUser({ ...editingUser, first_name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Apellidos</Label>
                                    <Input value={editingUser.last_name || ''} onChange={e => setEditingUser({ ...editingUser, last_name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Rol</Label>
                                    <Select value={editingUser.role} onValueChange={v => setEditingUser({ ...editingUser, role: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ADMIN">Administrador</SelectItem>
                                            <SelectItem value="DIRECTOR">Director</SelectItem>
                                            <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                                            <SelectItem value="ANALYST">Analista</SelectItem>
                                            <SelectItem value="CLIENT_ADMIN">Cliente (Admin)</SelectItem>
                                            <SelectItem value="CLIENT_USER">Cliente (Usuario)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Empresa</Label>
                                    <Select value={editingUser.company_id || 'none'} onValueChange={v => setEditingUser({ ...editingUser, company_id: v === 'none' ? null : v })}>
                                        <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- Sin Empresa --</SelectItem>
                                            {companies.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                        <Button onClick={handleUpdateUser} disabled={updating} className="w-full bg-emerald-600">
                            {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="py-3 px-4 border-b bg-neutral-50/50">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            placeholder="Buscar por nombre o email..."
                            className="pl-9 w-full md:w-[300px] bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Rol</TableHead>
                                <TableHead>Empresa</TableHead>
                                <TableHead>Último Acceso</TableHead>
                                <TableHead>Estatus</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && <TableRow><TableCell colSpan={6} className="text-center py-10">Cargando...</TableCell></TableRow>}

                            {!loading && filteredUsers.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <div className="font-medium text-neutral-900">{user.first_name} {user.last_name}</div>
                                        <div className="text-xs text-neutral-500">{user.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{user.role}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                        {user.company?.name || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600 whitespace-nowrap">
                                        {user.last_access ? new Date(user.last_access).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`
                                            ${user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}
                                            ${user.status === 'SUSPENDED' ? 'bg-red-100 text-red-700 hover:bg-red-100' : ''}
                                        `}>
                                            {user.status || 'ACTIVE'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm" variant="ghost"
                                                className="text-neutral-500 hover:text-neutral-900"
                                                onClick={() => handleEditClick(user)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm" variant="ghost"
                                                className={user.status === 'SUSPENDED' ? 'text-emerald-600' : 'text-red-600'}
                                                onClick={() => toggleStatus(user.id, user.status || 'ACTIVE')}
                                            >
                                                {user.status === 'SUSPENDED' ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
