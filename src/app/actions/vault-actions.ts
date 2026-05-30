'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Tipos base para la Bóveda
export interface VaultDocument {
  id: string;
  project_id: string;
  name: string;
  tags: string[];
  order_number: number;
  created_at: string;
  updated_at: string;
  latest_version?: VaultDocumentVersion;
}

export interface VaultDocumentVersion {
  id: string;
  vault_document_id: string;
  version_number: number;
  file_path: string;
  signed_url?: string | null;
  uploaded_by: string;
  uploaded_at: string;
  change_reason?: string;
  page_count?: number;
  is_validated: boolean;
  validated_by?: string;
  validated_at?: string;
}

type ProfileAuthorization = {
    role: string;
    status: string | null;
};

type AuthorizationResult =
    | { user: User; profile: ProfileAuthorization; error: null }
    | { user: null; profile: null; error: string };

type VersionHistoryRow = VaultDocumentVersion & {
    uploader?: { full_name?: string | null; role?: string | null } | null;
    validator?: { full_name?: string | null } | null;
};

type ProjectDocumentForVaultRow = {
    id: string;
    file_name: string | null;
    document_definitions?: { name?: string | null } | { name?: string | null }[] | null;
};

// -------------------------------------------------------------
// HELPER: Inicializar Supabase Client para Server Actions
// -------------------------------------------------------------
const getSupabase = async () => {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                async get(name: string) {
                    return (await cookies()).get(name)?.value;
                },
                async set(name: string, value: string, options: CookieOptions) {
                    (await cookies()).set({ name, value, ...options });
                },
                async remove(name: string, options: CookieOptions) {
                    (await cookies()).delete({ name, ...options });
                },
            },
        }
    );
};

const VAULT_MANAGER_ROLES = ['ADMIN', 'DIRECTOR', 'SUPERVISOR'];
const VAULT_VALIDATOR_ROLES = [...VAULT_MANAGER_ROLES, 'ANALYST'];

async function authorizeActiveUser(supabase: SupabaseClient): Promise<AuthorizationResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null, error: "Unauthorized" };

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        return { user: null, profile: null, error: "No se pudo verificar el perfil del usuario" };
    }

    if (profile.status === 'SUSPENDED') {
        return { user: null, profile: null, error: "Cuenta suspendida" };
    }

    return { user, profile, error: null };
}

async function authorizeVaultAction(supabase: SupabaseClient, allowedRoles: string[]): Promise<AuthorizationResult> {
    const authorization = await authorizeActiveUser(supabase);
    if (authorization.error || !authorization.user || !authorization.profile) return authorization;

    if (!allowedRoles.includes(authorization.profile.role)) {
        return { user: null, profile: null, error: "No autorizado para modificar la bóveda" };
    }

    return authorization;
}

// -------------------------------------------------------------
// GET: Obtener todos los documentos de la bóveda de un proyecto
// -------------------------------------------------------------
export async function getProjectVaultDocuments(projectId: string) {
    const supabase = await getSupabase();
    
    // 1. Obtener la lista de los documentos
    const { data: documents, error: docsError } = await supabase
        .from('vault_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('order_number', { ascending: true });

    if (docsError) throw new Error(`Error fetching vault documents: ${docsError.message}`);

    // 2. Obtener la ÚLTIMA versión de cada documento para mostrar estado
    const results = await Promise.all((documents || []).map(async (doc) => {
        const { data: latestVersion } = await supabase
            .from('vault_document_versions')
            .select('*')
            .eq('vault_document_id', doc.id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();
            
        return {
            ...doc,
            latest_version: latestVersion || null
        };
    }));

    return results;
}

// -------------------------------------------------------------
// GET: Obtener el historial completo de versiones de un documento
// -------------------------------------------------------------
export async function getDocumentVersionHistory(vaultDocumentId: string) {
    const supabase = await getSupabase();
    const authorization = await authorizeActiveUser(supabase);
    if (authorization.error || !authorization.user) throw new Error(authorization.error ?? "Unauthorized");
    
    const { data: versions, error } = await supabase
        .from('vault_document_versions')
        .select(`
            *,
            uploader:profiles!uploaded_by(full_name, role),
            validator:profiles!validated_by(full_name)
        `)
        .eq('vault_document_id', vaultDocumentId)
        .order('version_number', { ascending: false });

    if (error) throw new Error(`Error fetching version history: ${error.message}`);

    return Promise.all(((versions || []) as VersionHistoryRow[]).map(async (version) => {
        if (!version.file_path) return { ...version, signed_url: null };

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('vault')
            .createSignedUrl(version.file_path, 60 * 10);

        if (signedUrlError) {
            console.error(`Error creating signed URL for ${version.file_path}:`, signedUrlError);
        }

        return {
            ...version,
            signed_url: signedUrlData?.signedUrl ?? null
        };
    }));
}

// -------------------------------------------------------------
// POST: Validar una versión (Solo Analistas)
// -------------------------------------------------------------
export async function validateDocumentVersion(versionId: string, projectId: string) {
    const supabase = await getSupabase();
    
    const authorization = await authorizeVaultAction(supabase, VAULT_VALIDATOR_ROLES);
    if (authorization.error || !authorization.user) throw new Error(authorization.error ?? "Unauthorized");

    const { data: version, error: versionError } = await supabase
        .from('vault_document_versions')
        .select('id, vault_document_id')
        .eq('id', versionId)
        .single();

    if (versionError || !version) throw new Error("No se pudo encontrar la versión a validar");

    const { data: vaultDocument, error: vaultDocumentError } = await supabase
        .from('vault_documents')
        .select('id')
        .eq('id', version.vault_document_id)
        .eq('project_id', projectId)
        .single();

    if (vaultDocumentError || !vaultDocument) {
        throw new Error("La versión no pertenece al proyecto indicado");
    }
    
    // Marcar como validado
    const { error } = await supabase
        .from('vault_document_versions')
        .update({ 
            is_validated: true,
            validated_by: authorization.user.id,
            validated_at: new Date().toISOString()
        })
        .eq('id', versionId);

    if (error) throw new Error(`Error validating document: ${error.message}`);
    
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
}

// -------------------------------------------------------------
// POST: Subir una nueva versión de un documento a la Bóveda
// -------------------------------------------------------------
export async function uploadVaultDocumentVersion(formData: FormData) {
    const supabase = await getSupabase();
    
    const authorization = await authorizeVaultAction(supabase, VAULT_MANAGER_ROLES);
    if (authorization.error || !authorization.user) return { success: false, error: authorization.error ?? "Unauthorized" };

    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const vaultDocumentId = formData.get('vaultDocumentId') as string;
    const changeReason = formData.get('changeReason') as string;

    if (!file || !projectId || !vaultDocumentId) {
        return { success: false, error: "Missing required fields" };
    }

    try {
        const { data: vaultDocument, error: vaultDocumentError } = await supabase
            .from('vault_documents')
            .select('id')
            .eq('id', vaultDocumentId)
            .eq('project_id', projectId)
            .single();

        if (vaultDocumentError || !vaultDocument) {
            throw new Error("El documento de bóveda no pertenece al proyecto indicado.");
        }

        // 1. Determinar el próximo número de versión
        const { data: versions, error: verError } = await supabase
            .from('vault_document_versions')
            .select('version_number')
            .eq('vault_document_id', vaultDocumentId)
            .order('version_number', { ascending: false })
            .limit(1);

        if (verError) throw verError;
        
        const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

        // 2. Subir a Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${vaultDocumentId}/v${nextVersion}_${Date.now()}.${fileExt}`;
        const filePath = `${projectId}/originals/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('vault')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. Insertar el registro de la nueva versión
        const { error: insertError } = await supabase
            .from('vault_document_versions')
            .insert({
                vault_document_id: vaultDocumentId,
                version_number: nextVersion,
                file_path: filePath,
                uploaded_by: authorization.user.id,
                change_reason: changeReason || 'Carga inicial',
                // page_count lo extraemos luego o es opcional
            });

        if (insertError) throw insertError;

        // 4. (Opcional) Invalidar checklists u otras tareas de este proyecto asociadas a este tipo de documento.
        // Podríamos buscar project_tasks y ponerlos en "REVIEW_NEEDED".
        
        revalidatePath(`/projects/${projectId}`);
        return { success: true };

    } catch (error: unknown) {
        console.error("Upload error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error desconocido" };
    }
}

// -------------------------------------------------------------
// POST: Crear un nuevo "Contenedor Oficial" en la Bóveda y su primera versión (Alta Manual)
// -------------------------------------------------------------
export async function addVaultDocument(
    projectId: string, 
    name: string, 
    tags: string[], 
    orderNumber: number,
    projectDocumentId: string,
    changeReason: string
) {
    const supabase = await getSupabase();
    
    const authorization = await authorizeVaultAction(supabase, VAULT_MANAGER_ROLES);
    if (authorization.error || !authorization.user) return { success: false, error: authorization.error ?? "Unauthorized" };

    if (!projectDocumentId) return { success: false, error: "Debe seleccionar un documento base" };
    if (!changeReason) return { success: false, error: "Debe proveer un motivo" };

    try {
        // 1. Obtener la ruta del archivo del expediente digital
        const { data: sourceDoc, error: sourceError } = await supabase
            .from('project_documents')
            .select('file_path, file_name')
            .eq('id', projectDocumentId)
            .eq('project_id', projectId)
            .single();

        if (sourceError || !sourceDoc || !sourceDoc.file_path) {
            throw new Error("No se pudo encontrar el archivo origen del documento seleccionado.");
        }

        // 2. Crear el contenedor en la bóveda
        const { data: vaultDoc, error: vaultError } = await supabase
            .from('vault_documents')
            .insert({
                project_id: projectId,
                name,
                tags,
                order_number: orderNumber
            })
            .select()
            .single();

        if (vaultError) throw vaultError;

        // 3. Copiar el archivo en Storage a la ruta versionada
        const fileExt = sourceDoc.file_name ? sourceDoc.file_name.split('.').pop() : 'pdf';
        const newFileName = `${vaultDoc.id}/v1_${Date.now()}.${fileExt}`;
        const newFilePath = `${projectId}/originals/${newFileName}`;

        const { error: copyError } = await supabase.storage
            .from('vault')
            .copy(sourceDoc.file_path, newFilePath);

        if (copyError) throw copyError;

        // 4. Crear la primera versión del documento
        const { error: versionError } = await supabase
            .from('vault_document_versions')
            .insert({
                vault_document_id: vaultDoc.id,
                version_number: 1,
                file_path: newFilePath,
                uploaded_by: authorization.user.id,
                change_reason: changeReason
            });

        if (versionError) throw versionError;

        revalidatePath(`/projects/${projectId}`);
        return { success: true, data: vaultDoc };
    } catch (error: unknown) {
        console.error("Add Vault Document Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Error desconocido" };
    }
}

// -------------------------------------------------------------
// GET: Obtener los documentos del proyecto para la lista desplegable de la bóveda
// -------------------------------------------------------------
export async function getProjectDocumentsForVault(projectId: string) {
    const supabase = await getSupabase();
    
    // Obtenemos los documentos del expediente normal que ya tienen un archivo subido
    const { data, error } = await supabase
        .from('project_documents')
        .select(`
            id,
            file_name,
            document_definitions!inner (
                name
            )
        `)
        .eq('project_id', projectId)
        .not('file_name', 'is', null)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching project documents:", error);
        return [];
    }
    
    // Formateamos para el frontend
    return ((data || []) as ProjectDocumentForVaultRow[]).map((doc) => {
        const definition = Array.isArray(doc.document_definitions)
            ? doc.document_definitions[0]
            : doc.document_definitions;

        return {
            id: doc.id,
            name: definition?.name || doc.file_name || 'Documento sin nombre',
            file_name: doc.file_name
        };
    });
}


