'use server';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getProjectVaultDocuments } from './vault-actions';

// -------------------------------------------------------------
// HELPER: Inicializar Supabase Client
// -------------------------------------------------------------
const getSupabase = async () => {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                async get(name: string) { return (await cookies()).get(name)?.value; },
                async set(name: string, value: string, options: CookieOptions) { (await cookies()).set({ name, value, ...options }); },
                async remove(name: string, options: CookieOptions) { (await cookies()).delete({ name, ...options }); },
            },
        }
    );
};

const VAULT_MANAGER_ROLES = ['ADMIN', 'SUPERVISOR', 'DIRECTOR'];

async function requireVaultManager(supabase: Awaited<ReturnType<typeof getSupabase>>) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return { error: "Unauthorized" };
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile || !VAULT_MANAGER_ROLES.includes(profile.role)) {
        return { error: "Forbidden" };
    }

    return { user };
}

// -------------------------------------------------------------
// POST: Generar Foliado Maestro de un Proyecto
// -------------------------------------------------------------
export async function generateProjectFolios(projectId: string) {
    const supabase = await getSupabase();

    const auth = await requireVaultManager(supabase);
    if ('error' in auth) {
        return { success: false, message: auth.error, files: [] };
    }
    
    // 1. Obtener todos los documentos del proyecto ordenados
    const documents = await getProjectVaultDocuments(projectId);
    
    if (!documents || documents.length === 0) {
        throw new Error("El proyecto no tiene documentos en la bóveda.");
    }

    let globalPageNumber = 1;
    const preparedFiles: { path: string; bytes: Uint8Array }[] = [];
    const failures: string[] = [];

    // 2. Iterar sobre cada documento para descargar y foliar en memoria.
    for (const doc of documents) {
        const latestVersion = doc.latest_version;
        if (!latestVersion || !latestVersion.file_path) {
            failures.push(`${doc.name}: no tiene una versión vigente para foliar.`);
            continue;
        }

        // A. Descargar el archivo original desde Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('vault')
            .download(latestVersion.file_path);

        if (downloadError || !fileData) {
            console.error(`Error descargando ${doc.name}:`, downloadError);
            failures.push(`${doc.name}: no se pudo descargar el archivo original.`);
            continue;
        }

        const arrayBuffer = await fileData.arrayBuffer();

        // B. Abrir PDF con pdf-lib
        try {
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();

            // C. Estampar folio en cada página
            for (const page of pages) {
                const { width } = page.getSize();
                const folioText = `Folio: ${String(globalPageNumber).padStart(6, '0')}`;
                
                page.drawText(folioText, {
                    x: width - 120, // Esquina inferior derecha
                    y: 30,
                    size: 14,
                    font: helveticaFont,
                    color: rgb(1, 0, 0), // Rojo
                });
                
                globalPageNumber++;
            }

            // D. Guardar el PDF modificado en memoria
            const pdfBytes = await pdfDoc.save();

            // E. Preparar la copia foliada para subirla después de validar todo el lote.
            // El original estaba en algo como: <project_id>/originals/<uuid>.pdf
            // Lo guardaremos como: <project_id>/folios/<order>_<name>.pdf
            const safeName = doc.name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            const newFilePath = `${projectId}/folios/${String(doc.order_number).padStart(3, '0')}_${safeName}.pdf`;

            preparedFiles.push({ path: newFilePath, bytes: pdfBytes });

        } catch (pdfError) {
            console.error(`El archivo ${doc.name} no parece ser un PDF válido.`, pdfError);
            failures.push(`${doc.name}: el archivo no es un PDF válido.`);
        }
    }

    if (failures.length > 0 || preparedFiles.length !== documents.length) {
        return {
            success: false,
            message: `No se generó el foliado porque hay ${failures.length} documento(s) con errores: ${failures.join(' ')}`,
            files: []
        };
    }

    const foliatedFiles: string[] = [];

    // 3. Subir los folios solo cuando todos los documentos fueron procesados correctamente.
    for (const file of preparedFiles) {
        const { error: uploadError } = await supabase.storage
            .from('vault')
            .upload(file.path, file.bytes, {
                contentType: 'application/pdf',
                upsert: true // Sobreescribimos si ya existía el foliado anterior
            });

        if (uploadError) {
            console.error(`Error subiendo foliado ${file.path}:`, uploadError);
            return {
                success: false,
                message: `No se pudo guardar el foliado ${file.path}: ${uploadError.message}`,
                files: foliatedFiles
            };
        }

        foliatedFiles.push(file.path);
    }

    // 4. Opcional: Podríamos guardar en la BD una bitácora de que se generó un foliado

    return { 
        success: true, 
        message: `Foliado completado. Se foliaron ${globalPageNumber - 1} páginas en total.`,
        files: foliatedFiles
    };
}
