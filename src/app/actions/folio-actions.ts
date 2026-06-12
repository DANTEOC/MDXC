'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getProjectVaultDocuments } from './vault-actions';
import { requireProjectRole, VAULT_WRITE_ROLES } from './action-auth';

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

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido';

// -------------------------------------------------------------
// POST: Generar Foliado Maestro de un Proyecto
// -------------------------------------------------------------
export async function generateProjectFolios(projectId: string) {
    const supabase = await getSupabase();
    await requireProjectRole(supabase, projectId, VAULT_WRITE_ROLES);
    
    // 1. Obtener todos los documentos del proyecto ordenados
    const documents = await getProjectVaultDocuments(projectId);
    
    if (!documents || documents.length === 0) {
        throw new Error("El proyecto no tiene documentos en la bóveda.");
    }

    const documentsWithoutVersion = documents.filter(doc => !doc.latest_version?.file_path);
    if (documentsWithoutVersion.length > 0) {
        throw new Error(`No se puede generar el foliado: ${documentsWithoutVersion.length} documento(s) no tienen una versión archivada.`);
    }

    let globalPageNumber = 1;
    const foliatedFiles: string[] = [];

    // 2. Iterar sobre cada documento para descargar, foliar y volver a subir
    for (const doc of documents) {
        const latestVersion = doc.latest_version;
        if (!latestVersion?.file_path) {
            throw new Error(`El documento "${doc.name}" no tiene una versión archivada.`);
        }

        // A. Descargar el archivo original desde Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('vault')
            .download(latestVersion.file_path);

        if (downloadError || !fileData) {
            throw new Error(`Error descargando "${doc.name}": ${downloadError?.message || 'archivo no disponible'}`);
        }

        const arrayBuffer = await fileData.arrayBuffer();

        // B. Abrir PDF con pdf-lib
        try {
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            let nextPageNumber = globalPageNumber;

            // C. Estampar folio en cada página
            for (const page of pages) {
                const { width } = page.getSize();
                const folioText = `Folio: ${String(nextPageNumber).padStart(6, '0')}`;
                
                page.drawText(folioText, {
                    x: width - 120, // Esquina inferior derecha
                    y: 30,
                    size: 14,
                    font: helveticaFont,
                    color: rgb(1, 0, 0), // Rojo
                });
                
                nextPageNumber++;
            }

            // D. Guardar el PDF modificado en memoria
            const pdfBytes = await pdfDoc.save();

            // E. Subir la copia foliada a una subcarpeta /folios/
            // El original estaba en algo como: <project_id>/originals/<uuid>.pdf
            // Lo guardaremos como: <project_id>/folios/<order>_<name>.pdf
            const safeName = doc.name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            const newFilePath = `${projectId}/folios/${String(doc.order_number).padStart(3, '0')}_${safeName}.pdf`;

            const { error: uploadError } = await supabase.storage
                .from('vault')
                .upload(newFilePath, pdfBytes, {
                    contentType: 'application/pdf',
                    upsert: true // Sobreescribimos si ya existía el foliado anterior
                });

            if (uploadError) {
                throw new Error(`Error subiendo foliado de "${doc.name}": ${uploadError.message}`);
            }

            globalPageNumber = nextPageNumber;
            foliatedFiles.push(newFilePath);

        } catch (pdfError) {
            const message = getErrorMessage(pdfError);
            throw new Error(`No se pudo foliar "${doc.name}": ${message}`);
        }
    }

    // 3. Opcional: Podríamos guardar en la BD una bitácora de que se generó un foliado

    return { 
        success: true, 
        message: `Foliado completado. Se foliaros ${globalPageNumber - 1} páginas en total.`,
        files: foliatedFiles
    };
}
