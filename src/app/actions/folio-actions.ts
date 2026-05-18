'use server';

import { createServerClient } from '@supabase/ssr';
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Unauthorized");
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile || !['ADMIN', 'SUPERVISOR', 'DIRECTOR'].includes(profile.role)) {
        throw new Error("No autorizado para generar el foliado maestro.");
    }

    // 1. Obtener todos los documentos del proyecto ordenados
    const documents = await getProjectVaultDocuments(projectId);
    
    if (!documents || documents.length === 0) {
        throw new Error("El proyecto no tiene documentos en la bóveda.");
    }

    let globalPageNumber = 1;
    const preparedFiles: Array<{ path: string; bytes: Uint8Array }> = [];

    // 2. Primero preparar todos los PDFs; no publicamos un lote incompleto.
    for (const doc of documents) {
        const latestVersion = doc.latest_version;
        if (!latestVersion || !latestVersion.file_path) {
            throw new Error(`El documento "${doc.name}" no tiene una versión disponible para foliar.`);
        }

        // A. Descargar el archivo original desde Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('vault')
            .download(latestVersion.file_path);

        if (downloadError || !fileData) {
            throw new Error(`No se pudo descargar "${doc.name}": ${downloadError?.message || 'archivo vacío'}`);
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

            // E. Preparar la ruta de la copia foliada en /folios/
            // El original estaba en algo como: <project_id>/originals/<uuid>.pdf
            // Lo guardaremos como: <project_id>/folios/<order>_<name>.pdf
            const safeName = doc.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
            const newFilePath = `${projectId}/folios/${String(doc.order_number).padStart(3, '0')}_${safeName}.pdf`;
            preparedFiles.push({ path: newFilePath, bytes: pdfBytes });

        } catch (pdfError) {
            console.error(`El archivo ${doc.name} no parece ser un PDF válido.`, pdfError);
            throw new Error(`El documento "${doc.name}" no es un PDF válido y no puede incluirse en el foliado maestro.`);
        }
    }

    const foliatedFiles = [];

    // 3. Subir el lote ya validado. Cualquier fallo se comunica al usuario.
    for (const file of preparedFiles) {
        const { error: uploadError } = await supabase.storage
            .from('vault')
            .upload(file.path, file.bytes, {
                contentType: 'application/pdf',
                upsert: true // Sobreescribimos si ya existía el foliado anterior
            });

        if (uploadError) {
            throw new Error(`No se pudo subir el foliado "${file.path}": ${uploadError.message}`);
        }

        foliatedFiles.push(file.path);
    }

    return { 
        success: true, 
        message: `Foliado completado. Se foliaron ${globalPageNumber - 1} páginas en total.`,
        files: foliatedFiles
    };
}
