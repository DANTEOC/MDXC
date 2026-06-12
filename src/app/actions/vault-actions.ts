'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
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
  uploaded_by: string;
  uploaded_at: string;
  change_reason?: string;
  page_count?: number;
  is_validated: boolean;
  validated_by?: string;
  validated_at?: string;
}

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

const VAULT_WRITE_ROLES = new Set(['ADMIN', 'DIRECTOR', 'SUPERVISOR']);
const GLOBAL_PROJECT_ROLES = new Set(['ADMIN', 'DIRECTOR']);

type SupabaseServerClient = Awaited<ReturnType<typeof getSupabase>>;

async function getCurrentProfile(supabase: SupabaseServerClient) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        throw new Error("Unauthorized");
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        throw new Error("No se pudo validar el perfil del usuario.");
    }

    return {
        id: user.id,
        role: profile.role as string | null,
        company_id: profile.company_id as string | null,
    };
}

async function isProjectMember(supabase: SupabaseServerClient, userId: string, projectId: string) {
    const { data, error } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

async function ensureProjectReadAccess(supabase: SupabaseServerClient, projectId: string) {
    const profile = await getCurrentProfile(supabase);

    if (profile.role && GLOBAL_PROJECT_ROLES.has(profile.role)) {
        return profile;
    }

    if (await isProjectMember(supabase, profile.id, projectId)) {
        return profile;
    }

    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('client_id, manufacturer_id')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        throw new Error("Proyecto no encontrado o sin permisos.");
    }

    if (
        profile.company_id &&
        (project.client_id === profile.company_id || project.manufacturer_id === profile.company_id)
    ) {
        return profile;
    }

    throw new Error("No tienes permisos para acceder a este proyecto.");
}

async function ensureVaultWriteAccess(supabase: SupabaseServerClient, projectId: string) {
    const profile = await getCurrentProfile(supabase);

    if (!profile.role || !VAULT_WRITE_ROLES.has(profile.role)) {
        throw new Error("No tienes permisos para modificar la bóveda.");
    }

    if (GLOBAL_PROJECT_ROLES.has(profile.role)) {
        return profile;
    }

    if (!(await isProjectMember(supabase, profile.id, projectId))) {
        throw new Error("No tienes permisos para modificar este proyecto.");
    }

    return profile;
}

async function getVaultDocumentProjectId(supabase: SupabaseServerClient, vaultDocumentId: string) {
    const { data: vaultDocument, error } = await supabase
        .from('vault_documents')
        .select('project_id')
        .eq('id', vaultDocumentId)
        .single();

    if (error || !vaultDocument) {
        throw new Error("Documento de bóveda no encontrado.");
    }

    return vaultDocument.project_id as string;
}

async function getVersionLocation(supabase: SupabaseServerClient, versionId: string) {
    const { data: version, error: versionError } = await supabase
        .from('vault_document_versions')
        .select('vault_document_id, file_path')
        .eq('id', versionId)
        .single();

    if (versionError || !version) {
        throw new Error("Versión de documento no encontrada.");
    }

    const projectId = await getVaultDocumentProjectId(supabase, version.vault_document_id as string);
    return {
        projectId,
        filePath: version.file_path as string,
    };
}

// -------------------------------------------------------------
// GET: Obtener todos los documentos de la bóveda de un proyecto
// -------------------------------------------------------------
export async function getProjectVaultDocuments(projectId: string) {
    const supabase = await getSupabase();
    await ensureProjectReadAccess(supabase, projectId);
    
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
    const projectId = await getVaultDocumentProjectId(supabase, vaultDocumentId);
    await ensureProjectReadAccess(supabase, projectId);
    
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
    return versions;
}

export async function createVaultDocumentVersionSignedUrl(versionId: string) {
    const supabase = await getSupabase();
    const { projectId, filePath } = await getVersionLocation(supabase, versionId);
    await ensureProjectReadAccess(supabase, projectId);

    const { data, error } = await supabase.storage
        .from('vault')
        .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
        throw new Error(`Error generating signed URL: ${error?.message || 'URL no disponible'}`);
    }

    return data.signedUrl;
}

// -------------------------------------------------------------
// POST: Validar una versión (Solo Analistas)
// -------------------------------------------------------------
export async function validateDocumentVersion(versionId: string, projectId: string) {
    const supabase = await getSupabase();
    const versionLocation = await getVersionLocation(supabase, versionId);

    if (versionLocation.projectId !== projectId) {
        throw new Error("La versión no pertenece a este proyecto.");
    }

    const user = await ensureVaultWriteAccess(supabase, projectId);
    
    // Marcar como validado
    const { error } = await supabase
        .from('vault_document_versions')
        .update({ 
            is_validated: true,
            validated_by: user.id,
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

    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const vaultDocumentId = formData.get('vaultDocumentId') as string;
    const changeReason = formData.get('changeReason') as string;

    if (!file || !projectId || !vaultDocumentId) {
        return { success: false, error: "Missing required fields" };
    }

    try {
        const vaultProjectId = await getVaultDocumentProjectId(supabase, vaultDocumentId);
        if (vaultProjectId !== projectId) {
            throw new Error("El documento de bóveda no pertenece a este proyecto.");
        }

        const user = await ensureVaultWriteAccess(supabase, projectId);

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
                uploaded_by: user.id,
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
        const message = error instanceof Error ? error.message : "Error desconocido";
        return { success: false, error: message };
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

    if (!projectDocumentId) return { success: false, error: "Debe seleccionar un documento base" };
    if (!changeReason) return { success: false, error: "Debe proveer un motivo" };

    try {
        const user = await ensureVaultWriteAccess(supabase, projectId);

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

        // 2. Copiar el archivo en Storage a la ruta versionada antes de crear metadata.
        const vaultDocumentId = crypto.randomUUID();
        const fileExt = sourceDoc.file_name ? sourceDoc.file_name.split('.').pop() : 'pdf';
        const newFileName = `${vaultDocumentId}/v1_${Date.now()}.${fileExt}`;
        const newFilePath = `${projectId}/originals/${newFileName}`;

        const { error: copyError } = await supabase.storage
            .from('vault')
            .copy(sourceDoc.file_path, newFilePath);

        if (copyError) {
            const { data: legacyFile, error: legacyDownloadError } = await supabase.storage
                .from('project-files')
                .download(sourceDoc.file_path);

            if (legacyDownloadError || !legacyFile) throw copyError;

            const { error: legacyUploadError } = await supabase.storage
                .from('vault')
                .upload(newFilePath, legacyFile, {
                    contentType: legacyFile.type || undefined,
                });

            if (legacyUploadError) throw legacyUploadError;
        }

        // 3. Crear el contenedor en la bóveda
        const { data: vaultDoc, error: vaultError } = await supabase
            .from('vault_documents')
            .insert({
                id: vaultDocumentId,
                project_id: projectId,
                name,
                tags,
                order_number: orderNumber
            })
            .select()
            .single();

        if (vaultError) throw vaultError;

        // 4. Crear la primera versión del documento
        const { error: versionError } = await supabase
            .from('vault_document_versions')
            .insert({
                vault_document_id: vaultDocumentId,
                version_number: 1,
                file_path: newFilePath,
                uploaded_by: user.id,
                change_reason: changeReason
            });

        if (versionError) throw versionError;

        revalidatePath(`/projects/${projectId}`);
        return { success: true, data: vaultDoc };
    } catch (error: unknown) {
        console.error("Add Vault Document Error:", error);
        const message = error instanceof Error ? error.message : "Error desconocido";
        return { success: false, error: message };
    }
}

// -------------------------------------------------------------
// GET: Obtener los documentos del proyecto para la lista desplegable de la bóveda
// -------------------------------------------------------------
export async function getProjectDocumentsForVault(projectId: string) {
    const supabase = await getSupabase();
    await ensureVaultWriteAccess(supabase, projectId);
    
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
    return (data as ProjectDocumentForVaultRow[]).map((doc) => {
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


