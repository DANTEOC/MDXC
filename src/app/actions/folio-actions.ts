'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getProjectVaultDocuments, requireVaultManager } from './vault-actions';

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
                async set(name: string, value: string, options: any) { (await cookies()).set({ name, value, ...options }); },
                async remove(name: string, options: any) { (await cookies()).delete({ name, ...options }); },
            },
        }
    );
};

// -------------------------------------------------------------
// POST: Generar Foliado Maestro de un Proyecto
// -------------------------------------------------------------
export async function generateProjectFolios(projectId: string) {
    const supabase = await getSupabase();

    await requireVaultManager(supabase, projectId);
    
    // 1. Obtener todos los documentos del proyecto ordenados
    const documents = await getProjectVaultDocuments(projectId);
    
    if (!documents || documents.length === 0) {
        throw new Error("El proyecto no tiene documentos en la bóveda.");
    }

    let globalPageNumber = 1;
    const foliatedFiles = [];

    // 2. Iterar sobre cada documento para descargar, foliar y volver a subir
    for (const doc of documents) {
        const latestVersion = doc.latest_version;
        if (!latestVersion || !latestVersion.file_path) continue;

        // A. Descargar el archivo original desde Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('vault')
            .download(latestVersion.file_path);

        if (downloadError || !fileData) {
            console.error(`Error descargando ${doc.name}:`, downloadError);
            continue; // Skip si hay error (podría ser un archivo corrupto)
        }

        const arrayBuffer = await fileData.arrayBuffer();

        // B. Abrir PDF con pdf-lib
        try {
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();

            // C. Estampar folio en cada página
            for (const page of pages) {
                const { width, height } = page.getSize();
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
                console.error(`Error subiendo foliado de ${doc.name}:`, uploadError);
            } else {
                foliatedFiles.push(newFilePath);
            }

        } catch (pdfError) {
            console.error(`El archivo ${doc.name} no parece ser un PDF válido.`, pdfError);
            // Si no es PDF (ej. un excel o imagen), lo ignoramos para el foliado
        }
    }

    // 3. Opcional: Podríamos guardar en la BD una bitácora de que se generó un foliado

    return { 
        success: true, 
        message: `Foliado completado. Se foliaros ${globalPageNumber - 1} páginas en total.`,
        files: foliatedFiles
    };
}
