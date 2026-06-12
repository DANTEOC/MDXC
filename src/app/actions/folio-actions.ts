'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getProjectVaultDocuments } from './vault-actions';
import { requireVaultManager } from './vault-permissions';

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
    await requireVaultManager(supabase);
    
    // 1. Obtener todos los documentos del proyecto ordenados
    const documents = await getProjectVaultDocuments(projectId);
    
    if (!documents || documents.length === 0) {
        throw new Error("El proyecto no tiene documentos en la bóveda.");
    }

    let globalPageNumber = 1;
    const pendingUploads: { docName: string; filePath: string; pdfBytes: Uint8Array }[] = [];
    const failures: string[] = [];

    // 2. Iterar sobre cada documento para descargar y preparar el PDF foliado.
    // No escribimos en storage hasta confirmar que todos los documentos se pueden foliar.
    for (const doc of documents) {
        const latestVersion = doc.latest_version;
        if (!latestVersion || !latestVersion.file_path) {
            failures.push(`${doc.name}: no tiene una versión vigente con archivo.`);
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

            if (pages.length === 0) {
                failures.push(`${doc.name}: el PDF no contiene páginas.`);
                continue;
            }

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
            pendingUploads.push({ docName: doc.name, filePath: newFilePath, pdfBytes });

        } catch (pdfError) {
            console.error(`El archivo ${doc.name} no parece ser un PDF válido.`, pdfError);
            failures.push(`${doc.name}: el archivo no es un PDF válido.`);
        }
    }

    if (failures.length > 0) {
        throw new Error(`No se generó el foliado porque ${failures.length} documento(s) fallaron: ${failures.slice(0, 3).join(' | ')}`);
    }

    const foliatedFiles: string[] = [];

    // 3. Subir todos los PDFs foliados ya validados.
    for (const upload of pendingUploads) {
        const { error: uploadError } = await supabase.storage
            .from('vault')
            .upload(upload.filePath, upload.pdfBytes, {
                contentType: 'application/pdf',
                upsert: true // Sobreescribimos si ya existía el foliado anterior
            });

        if (uploadError) {
            console.error(`Error subiendo foliado de ${upload.docName}:`, uploadError);
            failures.push(`${upload.docName}: no se pudo subir el PDF foliado.`);
        } else {
            foliatedFiles.push(upload.filePath);
        }
    }

    if (failures.length > 0) {
        throw new Error(`El foliado no se completó: ${failures.slice(0, 3).join(' | ')}`);
    }

    return { 
        success: true, 
        message: `Foliado completado. Se foliaron ${globalPageNumber - 1} páginas en total.`,
        files: foliatedFiles
    };
}
