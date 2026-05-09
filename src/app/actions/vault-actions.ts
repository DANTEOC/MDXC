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

type ProjectDocumentForVault = {
    id: string;
    file_name: string | null;
    document_definitions?: {
        name?: string | null;
    } | null;
};

const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
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
        const { data: latestVersion, error: verError } = await supabase
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
// GET: Crear una URL temporal para consultar un archivo versionado
// -------------------------------------------------------------
export async function getVaultDocumentVersionSignedUrl(versionId: string) {
    const supabase = await getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { data: version, error: versionError } = await supabase
        .from('vault_document_versions')
        .select('file_path')
        .eq('id', versionId)
        .single();

    if (versionError || !version?.file_path) {
        return { success: false, error: "No se pudo encontrar el archivo solicitado." };
    }

    const { data, error } = await supabase.storage
        .from('vault')
        .createSignedUrl(version.file_path, 3600);

    if (error || !data?.signedUrl) {
        return { success: false, error: error?.message || "No se pudo generar la URL de descarga." };
    }

    return { success: true, signedUrl: data.signedUrl };
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
        // 1. Verificar que el contenedor pertenezca al proyecto recibido.
        const { data: vaultDoc, error: vaultDocError } = await supabase
            .from('vault_documents')
            .select('id')
            .eq('id', vaultDocumentId)
            .eq('project_id', projectId)
            .single();

        if (vaultDocError || !vaultDoc) {
            throw new Error("El documento de bóveda no pertenece al proyecto indicado.");
        }

        // 2. Determinar el próximo número de versión
        const { data: versions, error: verError } = await supabase
            .from('vault_document_versions')
            .select('version_number')
            .eq('vault_document_id', vaultDocumentId)
            .order('version_number', { ascending: false })
            .limit(1);

        if (verError) throw verError;
        
        const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

        // 3. Subir a Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${vaultDocumentId}/v${nextVersion}_${Date.now()}.${fileExt}`;
        const filePath = `${projectId}/originals/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('vault')
            .upload(filePath, file);

        if (uploadError) throw uploadError;
        uploadedFilePath = filePath;

        // 4. Insertar el registro de la nueva versión
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

        // 5. (Opcional) Invalidar checklists u otras tareas de este proyecto asociadas a este tipo de documento.
        // Podríamos buscar project_tasks y ponerlos en "REVIEW_NEEDED".
        
        revalidatePath(`/projects/${projectId}`);
        return { success: true };

    } catch (error: unknown) {
        if (uploadedFilePath) {
            await supabase.storage.from('vault').remove([uploadedFilePath]);
        }
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

    let createdVaultDocumentId: string | null = null;
    let copiedFilePath: string | null = null;

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
        createdVaultDocumentId = vaultDoc.id;

        // 3. Copiar el archivo en Storage a la ruta versionada
        const fileExt = sourceDoc.file_name ? sourceDoc.file_name.split('.').pop() : 'pdf';
        const newFileName = `${vaultDoc.id}/v1_${Date.now()}.${fileExt}`;
        const newFilePath = `${projectId}/originals/${newFileName}`;

        const { error: copyError } = await supabase.storage
            .from('vault')
            .copy(sourceDoc.file_path, newFilePath);

        if (copyError) throw copyError;
        copiedFilePath = newFilePath;

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
        createdVaultDocumentId = null;
        copiedFilePath = null;

        revalidatePath(`/projects/${projectId}`);
        return { success: true, data: vaultDoc };
    } catch (error: unknown) {
        if (copiedFilePath) {
            await supabase.storage.from('vault').remove([copiedFilePath]);
        }
        if (createdVaultDocumentId) {
            await supabase
                .from('vault_documents')
                .delete()
                .eq('id', createdVaultDocumentId);
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
    return data.map((doc: ProjectDocumentForVault) => ({
        id: doc.id,
        name: doc.document_definitions?.name || doc.file_name || 'Documento sin nombre',
        file_name: doc.file_name
    }));
}


