import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Inline CORS to avoid shared dependency issues during deploy
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version',
}

console.log("Extract Function (v-fix-02-debug)")

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        console.log('CHK 1: Start')
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Auth Header')

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        console.log('CHK 2: Client Created')

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized')
        console.log('CHK 3: User Auth OK')

        const body = await req.json()
        const { document_id, simulation_mode, file_path, fields_config, image_data, runtime_instructions } = body
        console.log('CHK 4: Body Parsed')

        let targetFile = ''
        let targetFields: any[] = []
        let docContextName = ''

        if (document_id && !simulation_mode) {
            console.log('CHK 5A: DB Fetch mode')
            const { data: doc, error: docError } = await supabaseClient
                .from('project_documents')
                .select('storage_path, file_path, definition:document_definitions(name, fields:field_definitions(key_identifier, name, ai_instructions, field_type))')
                .eq('id', document_id)
                .single()

            if (docError || !doc) throw new Error('Document not found')
            targetFile = doc.storage_path || doc.file_path // Prefer storage_path
            targetFields = (doc.definition.fields || []).filter((f: any) => f.field_type !== 'file');
            docContextName = doc.definition.name
        }
        else if (simulation_mode) {
            console.log('CHK 5B: Sim mode')
            targetFile = file_path
            targetFields = Array.isArray(fields_config) ? fields_config : []
            // docContextName = document_name || 'Documento Genérico' // Fixed Lint Error
            docContextName = 'Documento Genérico'
        } else {
            throw new Error('Invalid params')
        }

        let fileBody: Blob | null = null
        let fileType = ''

        // 1. Check for Direct Image Data (Client-side extraction override)
        if (image_data) {
            console.log('CHK 6A: Using provided image_data override')
            // Manual Base64 decoding to avoid fetch(data_url) issues in Deno
            try {
                const matches = image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new Error('Invalid input string');
                }
                const contentType = matches[1];
                const b64Data = matches[2];

                const binString = atob(b64Data);
                const data = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
                fileBody = new Blob([data], { type: contentType });
                fileType = contentType;
                console.log(`CHK 6B: Decoded image, type: ${fileType}, size: ${fileBody.size}`)
            } catch (err: any) {
                console.error("Base64 Decode Error:", err)
                throw new Error("Failed to process image data: " + err.message)
            }
        }
        // 2. Download from Storage (Standard Flow)
        else {
            console.log('CHK 6: Ready to Download: ' + targetFile)

            if (simulation_mode) {
                const { data: fileDown, error: downError } = await supabaseClient
                    .storage
                    .from('templates')
                    .download(targetFile)

                if (downError) throw new Error('DL Error (Template): ' + downError.message)
                fileBody = fileDown
                fileType = fileDown.type
            } else {
                // TRY VAULT (New Standard)
                let { data: fileDown, error: downError } = await supabaseClient
                    .storage
                    .from('vault')
                    .download(targetFile)

                if (downError) {
                    console.log('Vault DL failed, trying legacy project-files...')
                    // FALLBACK TO LEGACY (project-files)
                    const { data: legacyDown, error: legacyError } = await supabaseClient
                        .storage
                        .from('project-files')
                        .download(targetFile)

                    if (legacyError) {
                        throw new Error('DL Error (Both Buckets): ' + downError.message + ' | ' + legacyError.message)
                    }
                    fileDown = legacyDown
                }

                if (!fileDown) throw new Error('File download came back empty')
                fileBody = fileDown
                fileType = fileDown.type
            }
        }
        console.log('CHK 7: File Ready. Type: ' + fileType)

        // 6. Call OpenAI (Shared Logic)
        const arrayBuffer = await fileBody.arrayBuffer()

        // Safer conversion for large files
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64File = btoa(binaryString);

        // Construct Prompt
        const systemPrompt = `Eres un asistente de datos experto.
TU TAREA: Extraer información del documento y devolverla en un JSON plano.

REGLAS DE ORO PARA LAS KEYS (IMPORTANTE):
1. He provisto una lista de "FIELD_NAME" (Nombre visual) y su correspondiente "JSON_KEY" (Clave técnica).
2. TU JSON DEBE USAR ÚNICAMENTE LAS "JSON_KEY" como claves.
3. JAMÁS uses el "FIELD_NAME" como clave.
4. No agrupes nada bajo claves extrañas como "undefined" o "data". Devuelve el objeto plano raíz.`

        const fieldsDescription = targetFields.map((f: any) => {
            let instructions = f.ai_instructions || ''

            // Inject Runtime Instructions (e.g. Virtual Headers)
            if (runtime_instructions && runtime_instructions[f.key_identifier]) {
                instructions += ` [NOTA ADICIONAL: ${runtime_instructions[f.key_identifier]}]`;
            }

            if (f.field_type === 'table' || f.field_type === 'structured_table') {
                // Extract column names from runtime_instructions
                let columnNamesPrompt = '';
                if (runtime_instructions && runtime_instructions[f.key_identifier]) {
                    // Try to extract column names from the runtime instructions
                    const columnMatch = runtime_instructions[f.key_identifier].match(/\["([^"]+)"/);
                    if (columnMatch) {
                        // Extract all columns by finding all quoted strings
                        const allMatches = runtime_instructions[f.key_identifier].match(/"([^"]+)"/g);
                        if (allMatches && allMatches.length > 0) {
                            const columnList = allMatches.map((col, idx) => `${idx + 1}. ${col.replace(/"/g, '')}`).join('\n');
                            columnNamesPrompt = `\n\nNOMBRES EXACTOS DE COLUMNAS (USA ESTOS TAL CUAL):\n${columnList}\n\nDevuelve un JSON array donde cada objeto tiene EXACTAMENTE estas keys (con los mismos caracteres, espacios, paréntesis, etc.)`;
                        }
                    }
                }

                instructions += ` [CRÍTICO - EXTRACCIÓN DE TABLA:
                
Esta es una tabla con estructura fija. Extrae TODAS las filas y TODAS las columnas.${columnNamesPrompt}

INSTRUCCIONES OBLIGATORIAS:
1. Identifica visualmente la tabla (filas y columnas)
2. Para CADA fila, extrae TODAS las columnas en el MISMO orden
3. USA los nombres de columnas EXACTOS especificados arriba (NO los traduzcas)
4. Si una celda está vacía, usa ""
5. IMPORTANTE: Si una celda tiene múltiples líneas de texto (ej: Inglés y Chino, o varios valores), captura TODO el contenido unido por " / ". NO extraigas solo una línea.
6. SI VES UNA SUBDIVISIÓN HORIZONTAL en una celda (una línea dividiendo dos valores como "50 tests" y "100 tests"): Captura AMBOS valores separados por " | ".
7. NUNCA omitas columnas
8. NUNCA fusiones columnas similares (ej: Chino vs Inglés si son columnas separadas)
9. NUNCA cambies el orden

Devuelve un ARRAY de objetos JSON.]`;
            }
            return `- JSON_KEY: "${f.key_identifier}" (Field Name: "${f.name}") | Instructions: ${instructions}`
        }).join('\n')

        const userPrompt = `Tipo Documento: ${docContextName || 'General'}. Extrae la información:\n${fieldsDescription}`

        const openAIKey = Deno.env.get('OPENAI_API_KEY')
        let extractedJson: any = {}

        // FORCE MOCK due to User Request (Quota Limits)
        const FORCE_MOCK = false;

        if (FORCE_MOCK || !openAIKey) {
            console.log('Using Mock Data (forced or missing key).')
            targetFields.forEach((f: any) => {
                if (f && f.key_identifier) {
                    // Generate specialized mock data based on field name to make it look realistic
                    let mockValue = `[MOCK] ${f.name}`;

                    const nameLower = f.name.toLowerCase();
                    if (nameLower.includes('fecha')) mockValue = '2024-01-15';
                    else if (nameLower.includes('monto') || nameLower.includes('importe')) mockValue = '$1,250.00';
                    else if (nameLower.includes('curp')) mockValue = 'ABCD800101HDFRXX00';
                    else if (nameLower.includes('rfc')) mockValue = 'ABCD800101XYZ';

                    extractedJson[f.key_identifier] = mockValue;
                }
            })
            extractedJson['_meta_info'] = "SIMULATION MODE: Mock Data (Quota Limit Bypass)"
        } else {
            if (fileType === 'application/pdf') {
                if (!image_data) {
                    throw new Error('No se puede procesar PDF directamente. Por favor usa "Extraer esta página" desde la validación.');
                }
                // If image_data is present, fileBody is already the blob of that image (jpeg)
            } else if (!fileType.startsWith('image/')) {
                throw new Error(`Tipo de archivo no soportado por IA: ${fileType}. Se requiere Imagen (JPG, PNG) o extracción de página PDF.`);
            }


            console.log('Calling OpenAI...')

            const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAIKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: userPrompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${fileType};base64,${base64File}`
                                    }
                                }
                            ]
                        }
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 4096
                })
            })

            if (!openAIResponse.ok) {
                const errText = await openAIResponse.text()
                console.log('OpenAI Error: ' + errText)
                throw new Error(`OpenAI API Error: ${errText}`)
            }

            const aiData = await openAIResponse.json()
            const content = aiData.choices[0].message.content
            extractedJson = JSON.parse(content)
            console.log('Extracted successfully')
        }

        console.log('CHK 8: Returning Response')

        return new Response(
            JSON.stringify({ success: true, data: extractedJson }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error("CHK FAIL: " + error.message)
        return new Response(
            JSON.stringify({ error: "CHK Crashed: " + error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
