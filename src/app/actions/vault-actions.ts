'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const VAULT_BUCKET = 'vault';
const PROJECT_FILES_BUCKET = 'project-files';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type ProjectDocumentForVault = {
    id: string;
    file_name: string | null;
    file_path: string | null;
    storage_path: string | null;
    document_definitions?: {
        name?: string | null;
    } | null;
};

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

async function copyFileIntoVault(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    sourceBucket: typeof VAULT_BUCKET | typeof PROJECT_FILES_BUCKET,
    sourcePath: string,
    destinationPath: string
) {
    if (sourceBucket === VAULT_BUCKET) {
        const { error } = await supabase.storage
            .from(VAULT_BUCKET)
            .copy(sourcePath, destinationPath);

        if (error) throw error;
        return;
    }

    const { data: sourceFile, error: downloadError } = await supabase.storage
        .from(sourceBucket)
        .download(sourcePath);

    if (downloadError || !sourceFile) {
        throw downloadError || new Error('No se pudo descargar el archivo origen.');
    }

    const { error: uploadError } = await supabase.storage
        .from(VAULT_BUCKET)
        .upload(destinationPath, sourceFile, {
            contentType: sourceFile.type || undefined,
        });

    if (uploadError) throw uploadError;
}

async function removeVaultFileIfPresent(
    supabase: Awaited<ReturnType<typeof getSupabase>>,
    filePath: string | null
) {
    if (!filePath) return;
    await supabase.storage.from(VAULT_BUCKET).remove([filePath]);
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Error desconocido';
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

// -------------------------------------------------------------
// POST: Validar una versión (Solo Analistas)
// -------------------------------------------------------------
export async function validateDocumentVersion(versionId: string, projectId: string) {
    const supabase = await getSupabase();
    
    // Obtener usuario actual
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    
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
// GET: Crear URL firmada para abrir una versión en buckets privados
// -------------------------------------------------------------
export async function createVaultDocumentVersionSignedUrl(versionId: string) {
    const supabase = await getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { data: version, error: versionError } = await supabase
        .from('vault_document_versions')
        .select('file_path')
        .eq('id', versionId)
        .single();

    if (versionError || !version?.file_path) {
        return { success: false, error: "No se pudo encontrar la versión solicitada." };
    }

    const { data, error } = await supabase.storage
        .from(VAULT_BUCKET)
        .createSignedUrl(version.file_path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        return { success: false, error: error?.message || "No se pudo generar la URL del archivo." };
    }

    return { success: true, url: data.signedUrl };
}

// -------------------------------------------------------------
// POST: Subir una nueva versión de un documento a la Bóveda
// -------------------------------------------------------------
export async function uploadVaultDocumentVersion(formData: FormData) {
    const supabase = await getSupabase();
    
    // Obtener usuario actual
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const vaultDocumentId = formData.get('vaultDocumentId') as string;
    const changeReason = formData.get('changeReason') as string;

    if (!file || !projectId || !vaultDocumentId) {
        return { success: false, error: "Missing required fields" };
    }

    let uploadedFilePath: string | null = null;

    try {
        const { data: vaultDoc, error: vaultDocError } = await supabase
            .from('vault_documents')
            .select('project_id')
            .eq('id', vaultDocumentId)
            .single();

        if (vaultDocError || !vaultDoc) throw vaultDocError || new Error("No se encontró el documento de bóveda.");
        if (vaultDoc.project_id !== projectId) throw new Error("El documento de bóveda no pertenece al proyecto indicado.");

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
            .from(VAULT_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;
        uploadedFilePath = filePath;

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
        uploadedFilePath = null;

        // 4. (Opcional) Invalidar checklists u otras tareas de este proyecto asociadas a este tipo de documento.
        // Podríamos buscar project_tasks y ponerlos en "REVIEW_NEEDED".
        
        revalidatePath(`/projects/${projectId}`);
        return { success: true };

    } catch (error: unknown) {
        await removeVaultFileIfPresent(supabase, uploadedFilePath);
        console.error("Upload error:", error);
        return { success: false, error: getErrorMessage(error) };
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
    
    // Solo roles autorizados pueden crear contenedores
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    if (!projectDocumentId) return { success: false, error: "Debe seleccionar un documento base" };
    if (!changeReason) return { success: false, error: "Debe proveer un motivo" };

    let createdVaultDocId: string | null = null;
    let createdVaultFilePath: string | null = null;

    try {
        // 1. Obtener la ruta del archivo del expediente digital
        const { data: sourceDoc, error: sourceError } = await supabase
            .from('project_documents')
            .select('project_id, file_path, storage_path, file_name')
            .eq('id', projectDocumentId)
            .single();

        if (sourceError || !sourceDoc) {
            throw new Error("No se pudo encontrar el archivo origen del documento seleccionado.");
        }
        if (sourceDoc.project_id !== projectId) {
            throw new Error("El documento origen no pertenece al proyecto indicado.");
        }

        const sourcePath = sourceDoc.file_path || sourceDoc.storage_path;
        if (!sourcePath) {
            throw new Error("No se pudo encontrar el archivo origen del documento seleccionado.");
        }

        const sourceBucket = sourceDoc.file_path ? VAULT_BUCKET : PROJECT_FILES_BUCKET;

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
        createdVaultDocId = vaultDoc.id;

        // 3. Copiar el archivo en Storage a la ruta versionada
        const sourceFileName = sourceDoc.file_name || sourcePath.split('/').pop() || '';
        const fileExt = sourceFileName.includes('.') ? sourceFileName.split('.').pop() : 'pdf';
        const newFileName = `${vaultDoc.id}/v1_${Date.now()}.${fileExt}`;
        const newFilePath = `${projectId}/originals/${newFileName}`;

        await copyFileIntoVault(supabase, sourceBucket, sourcePath, newFilePath);
        createdVaultFilePath = newFilePath;

        // 4. Crear la primera versión del documento
        const { error: versionError } = await supabase
            .from('vault_document_versions')
            .insert({
                vault_document_id: vaultDoc.id,
                version_number: 1,
                file_path: newFilePath,
                uploaded_by: user.id,
                change_reason: changeReason
            });

        if (versionError) throw versionError;
        createdVaultDocId = null;
        createdVaultFilePath = null;

        revalidatePath(`/projects/${projectId}`);
        return { success: true, data: vaultDoc };
    } catch (error: unknown) {
        await removeVaultFileIfPresent(supabase, createdVaultFilePath);
        if (createdVaultDocId) {
            await supabase.from('vault_documents').delete().eq('id', createdVaultDocId);
        }
        console.error("Add Vault Document Error:", error);
        return { success: false, error: getErrorMessage(error) };
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
            file_path,
            storage_path,
            document_definitions!inner (
                name
            )
        `)
        .eq('project_id', projectId)
        .or('file_path.not.is.null,storage_path.not.is.null')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching project documents:", error);
        return [];
    }
    
    // Formateamos para el frontend
    return data.map((doc) => {
        const projectDoc = doc as ProjectDocumentForVault;
        return {
            id: projectDoc.id,
            name: projectDoc.document_definitions?.name || projectDoc.file_name || 'Documento sin nombre',
            file_name: projectDoc.file_name || projectDoc.file_path?.split('/').pop() || projectDoc.storage_path?.split('/').pop() || 'Archivo cargado'
        };
    });
}


