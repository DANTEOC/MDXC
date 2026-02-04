🧠 AGENTE CODIFICADOR — MDXC Control Documental (v1.0)
Objetivos del Proyecto MDXC
MDXC es un Sistema de Control Documental (DMS - Document Management System). A diferencia de MMD (Mantenimiento), aquí la prioridad es la Integridad, Trazabilidad y Seguridad de la información.

📝 Reglas de Contexto (¡NO CONFUNDIR CON MMD!)
Concepto	MMD Maintenance (Proyecto Actual)	MDXC Control Documental (Nuevo Proyecto)
Foco	Operativo, Órdenes de Trabajo, Inventario	Normativo, Versiones, Flujos de Aprobación
Entidad Principal	Work Order / Asset	Document / Revision
Roles Clave	Tecnico, Supervisor, Admin	Redactor, Revisor, Aprobador, Auditor
Seguridad	RLS por Tenant	RLS por Nivel de Confidencialidad + Tenant
🚫 Prohibiciones Específicas para MDXC (Seguridad Normativa)
NUNCA ELIMINAR REGISTROS (Hard Delete):

En un sistema documental, la historia es sagrada.
Usar siempre soft_delete o is_active = false.
Excepción: Borrado de datos erróneos durante desarrollo inicial (solo bajo orden explícita).
INMUTABILIDAD DE VERSIONES:

Una vez que un documento pasa a estado APPROVED o PUBLISHED, su registro no se toca.
Si hay cambios, se crea una NUEVA VERSIÓN.
AUDIT TRAIL OBLIGATORIO:

Toda acción crítica (Crear, Editar, Aprobar, Descargar) debe dejar rastro en audit_logs.
🤖 Rol del Agente en MDXC
Tu función: Implementar funcionalidades de gestión documental estrictas.

Flujo de Trabajo:

Ticket: Recibes requerimiento (ej: "Crear flujo de aprobación").
Validación de Integridad: Antes de codificar, verificas: "¿Esto rompe la cadena de custodia del documento?".
Implementación: Typescript + Supabase.
Entrega: Código + SQL + Prueba de Trazabilidad.
🛠 Stack Tecnológico Confirmado (MDXC)
Frontend: Next.js App Router (Igual que MMD).
Estilos: Tailwind CSS (Si se requiere, confirmar versión) o CSS Vainilla (según preferencia del user).
Backend: Supabase (Auth, Postgres, Storage).
Storage: Crítico en este proyecto. Las Policies de Storage deben ser tan estrictas como las de la base de datos.
✅ Checklist de "Cambio de Contexto"
Cuando cambies de MMD a MDXC, por favor ejecuta o verifica:

 Cerrar archivos/pestañas de MMD.
 Verificar el project_ref de Supabase (Debe ser el de MDXC, no el de MMD).
 Leer este archivo de reglas antes de empezar.
Copia este contenido en un archivo llamado reglas-mdxc.md o .cursorrules en la raíz tu carpeta del proyecto MDXC.