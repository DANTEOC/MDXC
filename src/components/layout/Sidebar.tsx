'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  Home,
  CheckSquare,
  Users,
  Factory,
  FileText,
  FolderKanban,
  Settings,
  LogOut,
  UserCircle,
  Building2,
  Database
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<{
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string | null;
  } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const role = profile?.role; // Derived for menu logic

  // Hide sidebar on Auth Pages
  if (pathname?.startsWith('/login') || pathname?.startsWith('/auth')) {
    return null;
  }

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, role')
          .eq('id', user.id)
          .single();

        setProfile({
          firstName: data?.first_name || user.user_metadata?.first_name || 'Usuario',
          lastName: data?.last_name || user.user_metadata?.last_name || '',
          email: data?.email || user.email || '',
          role: data?.role || 'ANALYST'
        });
      }
    }
    getProfile();
  }, []);

  /* MMD: Updated logic to route Admins to their specific dashboards */
  const allMenuItems = [
    { name: 'Home', icon: Home, href: '/dashboard', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR', 'ANALYST', 'CLIENT', 'MANUFACTURER'] },
    // Tasks link removed as per Dashboard Refactoring
    {
      name: 'Trámites y Gestiones',
      icon: CheckSquare,
      href: '/admin/catalogs/procedures',
      roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR']
    },
    {
      name: 'Proyectos',
      icon: FolderKanban,
      href: (role === 'ADMIN' || role === 'DIRECTOR') ? '/admin/projects' : '/projects',
      roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR', 'ANALYST', 'CLIENT', 'MANUFACTURER']
    },
    { name: 'Clientes', icon: Users, href: '/admin/clients', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
    { name: 'Fabricantes', icon: Factory, href: '/admin/manufacturers', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
    { name: 'Documentos', icon: FileText, href: '/documents', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
    // Flattened Catalog Items (Under Documentos)
    { name: 'Tipos Documento', icon: FileText, href: '/admin/catalogs/documents', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
    { name: 'Tipos de Campos', icon: Database, href: '/admin/catalogs/field-types', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
  ];

  const menuItems = allMenuItems.filter(item => !item.roles || (role && item.roles.includes(role)));

  // Admin / Supervisor Management Items (Remaining)
  const adminItems = [
    { name: 'Usuarios', icon: UserCircle, href: '/admin/users', roles: ['ADMIN', 'DIRECTOR'] },
    { name: 'Plantillas', icon: FileText, href: '/admin/templates', roles: ['ADMIN', 'DIRECTOR', 'SUPERVISOR'] },
    // Removed: Catálogos, Configuraciones
  ];

  const filteredAdminItems = adminItems.filter(item => role && item.roles.includes(role));

  return (
    <div className="flex bg-sidebar h-screen w-64 flex-col text-sidebar-foreground transition-all duration-300 shadow-xl z-20 sticky top-0">
      {/* Header / Logo */}
      <div className="flex flex-col items-center justify-center p-6 border-b border-sidebar-border/10">
        <h1 className="text-3xl font-light tracking-widest text-white">MDXC</h1>
        <p className="text-[10px] text-center text-sidebar-foreground/70 mt-1 tracking-wider">
          ADMINISTRACIÓN Y<br />ANÁLISIS DOCUMENTAL
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-4 border-white"
                  : "text-sidebar-foreground/80"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}

        {filteredAdminItems.length > 0 && (
          <>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
              Administración
            </div>
            {filteredAdminItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-4 border-white"
                      : "text-sidebar-foreground/80"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-4 mt-auto">
        <div className="mb-4 p-4 rounded-xl bg-sidebar-primary/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
              {profile?.firstName?.charAt(0) || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-white" title={`${profile?.firstName} ${profile?.lastName}`}>
                {profile ? `${profile.firstName} ${profile.lastName}` : 'Cargando...'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/70 truncate" title={profile?.email || ''}>
                {profile?.email || ''}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white">
              {role === 'ANALYST' ? 'ANALISTA' : role === 'MANUFACTURER' ? 'FABRICANTE' : role || '...'}
            </span>
          </div>
        </div>

        <Button
          variant="default"
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-2 justify-center shadow-lg"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
        >
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </div>
    </div>
  );
}
