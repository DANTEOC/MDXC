'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, ArrowLeft, Save, Bot, Edit, Eye, ZoomIn, ZoomOut } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { FileUploadField } from '@/components/admin/FileUploadField';
import { TableField } from '@/components/admin/TableField';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source (using local file to avoid CDN/CORS issues)
// Ensure you have copied 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs' to 'public/pdf.worker.min.mjs'
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';
}

// Helper Function for Universal Table Extraction Strategy
const generateTablePrompt = (
    key: string,
    existingData: any[],
    strictHeaders: string[] | undefined
): { instructions: string, headers: string[] | undefined } => {

    // MODE 1: PREDEFINED STRICT (Table 1)
    if (strictHeaders && strictHeaders.length > 0) {
        const headerList = strictHeaders.join('", "');
        const columnCount = strictHeaders.length;
        return {
            headers: strictHeaders,
            instructions: `CRÍTICO: Esta tabla principal DEBE tener EXACTAMENTE ${columnCount} columnas: ["${headerList}"].
REGLAS:
1. Devuelve TODAS las ${columnCount} columnas en el MISMO orden.
2. Si una tabla en la imagen NO TIENE estas ${columnCount} columnas (ej: tiene menos o es diferente), NO LA PONGAS AQUÍ. Déjala vacía [].
3. NO fusiones columnas.
4. SOLO extrae si coincide con la estructura requerida.`
        };
    }

    // MODE 2: DYNAMIC HISTORY STRICTNESS (Table 2+ after first page)
    const hasHistory = Array.isArray(existingData) && existingData.length > 0;
    if (hasHistory) {
        const firstRow = existingData[0];
        if (typeof firstRow === 'object' && firstRow !== null) {
            const inferredHeaders = Object.keys(firstRow);
            const columnCount = inferredHeaders.length;
            const headerList = inferredHeaders.join('", "');
            return {
                headers: inferredHeaders,
                instructions: `IMPORTANTE: Esta tabla YA TIENE una estructura definida previamente. DEBES RESPETARLA.
Columnas Esperadas (${columnCount}): ["${headerList}"].
REGLAS:
1. Extrae los datos de esta página y mapealos EXACTAMENTE a estas columnas.
2. NO inventes columnas nuevas.
3. NO omitas columnas existentes.
4. Si la tabla visual tiene ligeras variaciones, FUERZA los datos a este esquema.`
            };
        }
    }

    // MODE 3: DISCOVERY (New Unknown Table)
    return {
        headers: undefined,
        instructions: `INSTRUCCIÓN DE DESCUBRIMIENTO:
Esta es una tabla nueva. Extrae su estructura VISUAL tal cual aparece en la imagen.
- Identifica todas las columnas visibles.
- Usa los textos de la cabecera como nombres de propiedades JSON.
- Separa claramente columnas pegadas.`
    };
};

export default function ValidateDocumentPage() {
    const { id: projectId, docId } = useParams();
    const router = useRouter();

    const [document, setDocument] = useState<any>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // PDF State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [renderTask, setRenderTask] = useState<any>(null);
    const [scale, setScale] = useState(1.5);
    const [viewField, setViewField] = useState<{ name: string, content: string } | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [appendMode, setAppendMode] = useState(true); // Default to true (Append)


    useEffect(() => {
        async function loadData() {
            if (!docId) return;

            // 0. Get Current User Role
            const { data: { user } } = await supabase.auth.getUser();
            let role = 'ANALYST'; // Default to restrictive
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (profile) role = profile.role;
            }
            setCurrentUserRole(role);

            // 1. Fetch Document & Definition
            const { data: doc } = await supabase
                .from('project_documents')
                .select(`
          *,
          definition:document_definitions (
            name,
            fields:field_definitions (*)
          )
        `)
                .eq('id', docId)
                .single();

            if (!doc) {
                setLoading(false);
                return;
            }

            // SECURITY CHECK: Confidential Documents
            // If ANY field is CONFIDENTIAL, strict access for ANALYSTS is PROHIBITED.
            const hasConfidentialFields = doc.definition?.fields?.some((f: { sensitivity?: string }) => f.sensitivity === 'CONFIDENTIAL');
            if (role === 'ANALYST' && hasConfidentialFields) {
                alert('⛔ ACCESO DENEGADO\n\nEste documento contiene información confidencial restringida para analistas.\nDebe ser validado por un Supervisor o Director.');
                router.push(`/admin/projects/${projectId}`); // Redirect
                return;
            }

            // Sort fields by display_order
            if (doc.definition?.fields) {
                doc.definition.fields.sort((a: any, b: any) =>
                    (a.display_order || 999) - (b.display_order || 999)
                );
            }

            setDocument(doc);

            // Initialize form with Extracted Data OR Empty
            setFormData(doc.extracted_data || {});

            // 2. Get Signed URL for View (Try 'vault' first, then 'project-files')
            const path = doc.storage_path || doc.file_path;
            if (path) {
                try {
                    let { data: urlData, error } = await supabase
                        .storage
                        .from('vault')
                        .createSignedUrl(path, 3600); // 1 hour access

                    if (error || !urlData?.signedUrl) {
                        // Fallback to legacy bucket or project-files
                        const { data: legacyData, error: legacyError } = await supabase
                            .storage
                            .from('project-files')
                            .createSignedUrl(path, 3600);

                        if (!legacyError && legacyData?.signedUrl) {
                            urlData = legacyData;
                        }
                    }

                    if (urlData?.signedUrl) {
                        setFileUrl(urlData.signedUrl);
                    } else {
                        console.warn("Could not generate signed URL for path:", doc.file_path);
                    }

                } catch (err) {
                    console.error("Error loading file URL:", err);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        }
        loadData();
    }, [docId]);

    const handleFieldChange = async (key: string, value: any) => {
        setFormData(prev => {
            const updated = { ...prev, [key]: value };

            // Auto-save table changes to DB (for Clear Table and other edits)
            // Find if this is a table field
            const field = document?.definition?.fields?.find((f: any) => f.key_identifier === key);
            if (field?.field_type === 'table' || field?.field_type === 'structured_table') {
                // Debounced save for table changes
                setTimeout(async () => {
                    try {
                        await supabase
                            .from('project_documents')
                            .update({
                                extracted_data: updated,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', docId);
                        console.log('[Auto-save] Table changes persisted to DB');
                    } catch (err) {
                        console.error('[Auto-save] Failed:', err);
                    }
                }, 500); // 500ms debounce
            }

            return updated;
        });
    };

    const handleSave = async (isValid: boolean) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('project_documents')
                .update({
                    extracted_data: formData,
                    status: isValid ? 'VALID' : 'REJECTED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', docId);

            if (error) throw error;

            router.push(`/projects/${projectId}`);
        } catch (err) {
            console.error(err);
            alert('Error saving validation');
        } finally {
            setSaving(false);
        }
    };

    // PDF Loading Logic
    useEffect(() => {
        if (!fileUrl || !fileUrl.toLowerCase().includes('.pdf')) return;

        const loadPdf = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument(fileUrl);
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
                setPageNum(1); // Reset to page 1
            } catch (error) {
                console.error("Error loading PDF:", error);
                alert("Error al cargar el PDF. Verifica que el archivo sea válido.");
            }
        };

        loadPdf();
    }, [fileUrl]);

    // PDF Rendering Logic
    useEffect(() => {
        if (!pdfDoc) return;

        const renderPage = async () => {
            if (renderTask) {
                renderTask.cancel();
            }

            try {
                const page = await pdfDoc.getPage(pageNum);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                if (!context) return;

                // Adjust scale for better resolution
                const viewport = page.getViewport({ scale: scale });
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };

                const task = page.render(renderContext);
                setRenderTask(task);
                await task.promise;
            } catch (error: any) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error("Error rendering page:", error);
                }
            }
        };

        renderPage();
    }, [pdfDoc, pageNum, scale]);

    const prevPage = () => {
        if (pageNum > 1) setPageNum(pageNum - 1);
    }

    const nextPage = () => {
        if (pdfDoc && pageNum < pdfDoc.numPages) setPageNum(pageNum + 1);
    }

    const [processingAI, setProcessingAI] = useState(false);

    const handleRetryAI = async (base64Image?: string) => {
        if (!document) return;

        // 1. PDF Blocking for Full Extraction
        if (!base64Image && fileUrl?.toLowerCase().includes('.pdf')) {
            alert("Para documentos PDF, por favor utiliza el botón 'Extraer esta página' ubicado debajo del visor del documento, ya que el análisis completo no está disponible para este formato.");
            return;
        }

        setProcessingAI(true);
        try {
            // Refresh session to ensure we have a valid, up-to-date token
            const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
            if (sessionError || !session) {
                console.error("Failed to refresh session:", sessionError);
                throw new Error("No hay sesión activa. Por favor recarga la página o inicia sesión nuevamente.");
            }
            console.log("Session refreshed, calling function...", {
                accessTokenPresent: !!session.access_token,
                user: session.user.email
            });

            // 1.1 Runtime Schema Consistency & Virtual Headers
            // User Feedback: "Copy headers from P1 to P2 so it knows what to extract."
            // CRITICAL: AI must return ALL columns in EXACT order, even if empty.
            // CRITICAL 2: Table has 7 columns, some with similar names (Chinese vs English versions)
            const runtime_instructions: Record<string, string> = {};
            // NOTE: tableHeaderMap is also used in Render, so we should rely on the component-level computation if possible.
            // But here we need it specifically for the AI Instructions.
            const tableHeaderMap: Record<string, string[]> = {};

            // Calculate Virtual Headers for Table Fields
            if (document.definition?.fields) {
                document.definition.fields.forEach((f: any) => {
                    if (f.field_type === 'table' || f.field_type === 'structured_table') {
                        // Check if we have existing data for this table
                        const existingData = formData[f.key_identifier] || document.extracted_data?.[f.key_identifier];

                        // Configuration for Strict Tables (Universal Config Approach)
                        let predefinedHeaders: string[] | undefined = undefined;

                        if (f.key_identifier === 'tablas1') {
                            predefinedHeaders = [
                                "序号 NO",
                                "产品名称（中文）Product(s)（chinese)",
                                "产品名称（英文）Product(s)",
                                "规格型号（中文）Specification/model（chinese)",
                                "规格型号（英文）Specification/mode",
                                "产品注册证或备案凭证号(中文) Registration certificate(s)",
                                "产品注册证或备案凭证号(英文) Registration certificate(s)"
                            ];
                        }

                        // Generate Prompt using Universal Helper
                        const result = generateTablePrompt(f.key_identifier, existingData, predefinedHeaders);

                        // Apply Results
                        runtime_instructions[f.key_identifier] = result.instructions;
                        if (result.headers) {
                            tableHeaderMap[f.key_identifier] = result.headers;
                            console.log(`[Universal Table Logic] Applied headers for ${f.key_identifier}:`, result.headers);
                        } else {
                            console.log(`[Universal Table Logic] Discovery mode for ${f.key_identifier}`);
                        }
                    }
                });
            }

            const body = {
                document_id: document.id,
                image_data: base64Image,
                runtime_instructions
            };

            console.log("Invoking Edge Function with session:", {
                hasSession: !!session,
                userId: session?.user?.id,
                tokenLength: session?.access_token?.length
            });

            // Use fetch directly to have full control over headers
            const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-document-data`;
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Edge Function HTTP Error:", response.status, errorText);
                throw new Error(`Edge Function returned ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const data = result;
            const error = result.error ? new Error(result.error) : null;

            if (error) {
                console.error("Edge Function Invocation Error:", error);
                let msg = error.message || "Unknown Error";
                if (error instanceof Error) msg = error.message;
                throw new Error("Function Failed: " + msg);
            }
            if (data && data.error) {
                throw new Error("Function Error: " + data.error);
            }

            // 2. Data Persistence Logic
            const newData = data.data || {};
            const currentAiData = document.extracted_data || {};
            const currentUserData = formData || {};

            // Merge Logic: Overwrite existing fields if new data is present
            const mergedAiData = { ...currentAiData };
            const mergedUserData = { ...currentUserData };

            Object.entries(newData).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {

                    // SPECIAL HANDLING: Table Append (Multi-page)
                    // If extracting a specific page (base64Image present) AND field is table AND we have existing data
                    const fieldDef = document.definition.fields.find((f: any) => f.key_identifier === key);
                    const isTable = fieldDef?.field_type === 'table' || fieldDef?.field_type === 'structured_table';

                    if (base64Image && isTable && Array.isArray(value) && appendMode) {

                        // --- GUARDRAIL: Strict Schema Validation ---
                        // "Protect the process": If we have a defined schema (Tablas1), reject data that doesn't match.
                        // This prevents "Table 2" data from polluting "Table 1" if AI gets confused.
                        if (tableHeaderMap[key]) {
                            const expectedCols = tableHeaderMap[key];
                            const firstRow = value[0];

                            if (firstRow && typeof firstRow === 'object') {
                                const incomingKeys = Object.keys(firstRow);
                                // Check for intersection
                                const matchingCols = incomingKeys.filter(k => expectedCols.includes(k));
                                const matchRatio = matchingCols.length / expectedCols.length;

                                // REJECTION RULE: Strict 70% match required to prevent pollution
                                if (matchRatio < 0.7) {
                                    console.warn(`🛡️ [GUARDRAIL] REJECTED data for '${key}' - Schema Mismatch!`);
                                    console.warn(`   Expected (${expectedCols.length}):`, expectedCols);
                                    console.warn(`   Received (${incomingKeys.length}):`, incomingKeys);
                                    console.warn(`   Match Ratio: ${matchRatio.toFixed(2)} (< 0.7 required)`);
                                    return; // SKIP saving this data
                                }
                                console.log(`🛡️ [GUARDRAIL] VALID data for '${key}' (Match: ${Math.round(matchRatio * 100)}%)`);
                            }
                        }
                        // -------------------------------------------

                        // FIX: Strict check for user data. If formData has an array (even empty), USE IT.
                        let existing = mergedAiData[key];
                        if (formData && Array.isArray(formData[key])) {
                            existing = formData[key];
                        }

                        console.log(`[Append Logic] Field: ${key}`, {
                            userHasData: Array.isArray(formData[key]),
                            userDataLength: formData[key]?.length,
                            aiHistoryLength: mergedAiData[key]?.length,
                            willAppendTo: existing?.length,
                            newRows: value.length
                        });

                        // If existing is array, append. If not, just set.
                        if (Array.isArray(existing) && existing.length > 0) {
                            // NORMALIZATION: Handle "Staircase" effect (different keys in P2).
                            // CRITICAL FIX: Use FIRST row's keys as canonical order (stable reference)
                            // Problem: Set union can reorder keys randomly between extractions
                            // CRITICAL FIX: Prefer predefined strict headers if available.
                            // Only fallback to first row if no strict headers defined.
                            let canonicalHeaders: string[] = [];

                            if (tableHeaderMap[key]) {
                                canonicalHeaders = tableHeaderMap[key];
                                console.log("[Canonical Headers] Using STRICT PREDEFINED definition:", canonicalHeaders);
                            } else {
                                const firstRow = existing[0];
                                canonicalHeaders = firstRow && typeof firstRow === 'object'
                                    ? Object.keys(firstRow)
                                    : [];
                                console.log("[Canonical Headers] Using FIRST ROW inference (Legacy):", canonicalHeaders);
                            }

                            if (canonicalHeaders.length === 0) {
                                // Fallback: if first row is empty, just use new data as-is
                                mergedAiData[key] = [...existing, ...value];
                                mergedUserData[key] = [...existing, ...value];
                                return;
                            }

                            console.log("[Canonical Headers] Using FIRST row as reference:", canonicalHeaders);

                            // 2. Normalize New Rows (POSITIONAL FORCE STRATEGY)
                            // User Feedback: "Shift Left" still happening because AI drops keys (e.g. drops "NO" key if empty).
                            // Solution: FORCE mapping values to headers by POSITION. We trust our "Virtual Headers" instruction forced the AI to output in order.

                            const normalizedNewRows = value.map((row: any, rowIndex: number) => {
                                if (!row || typeof row !== 'object') return row;

                                // CRITICAL DEBUG: Log what AI actually returned
                                const aiKeys = Object.keys(row);
                                const rowValues = Object.values(row);

                                console.log(`[Row ${rowIndex}] AI returned ${aiKeys.length} keys:`, aiKeys);
                                console.log(`[Row ${rowIndex}] Expected ${canonicalHeaders.length} keys:`, canonicalHeaders);

                                // SMART REPAIR: Handle AI returning fewer columns than expected
                                if (rowValues.length < canonicalHeaders.length) {
                                    console.warn(`⚠️ [Row ${rowIndex}] AI returned ${rowValues.length} columns, expected ${canonicalHeaders.length}. Applying SMART REPAIR...`);
                                    console.log(`   AI Keys:`, aiKeys);
                                    console.log(`   AI Values:`, rowValues);

                                    const fixedRow: any = {};

                                    // ENHANCED INTELLIGENT MAPPING STRATEGY:
                                    // 1. Analyze AI column names (keys) to understand intent
                                    // 2. Analyze AI values to detect language (Chinese vs English)
                                    // 3. Map intelligently to correct columns
                                    // 4. Duplicate data where appropriate (e.g., use English name for Chinese if missing)

                                    // Helper function to detect if text contains Chinese characters
                                    const hasChinese = (text: string) => /[\u4e00-\u9fa5]/.test(text);

                                    // Initialize all columns to empty
                                    canonicalHeaders.forEach((header) => {
                                        fixedRow[header] = "";
                                    });

                                    // Process each AI column
                                    aiKeys.forEach((aiKey, aiIndex) => {
                                        const aiKeyLower = aiKey.toLowerCase();
                                        const value = String(rowValues[aiIndex] || "");

                                        // PRODUCT NAME mapping
                                        if (aiKeyLower.includes('product') || aiKeyLower.includes('name')) {
                                            if (hasChinese(value)) {
                                                // Chinese product name
                                                const chineseCol = canonicalHeaders.find(h =>
                                                    h.includes('产品名称') && (h.includes('中文') || h.includes('chinese'))
                                                );
                                                if (chineseCol) fixedRow[chineseCol] = value;
                                            } else {
                                                // English product name
                                                const englishCol = canonicalHeaders.find(h =>
                                                    h.includes('产品名称') && h.includes('英文')
                                                ) || canonicalHeaders.find(h =>
                                                    h.toLowerCase().includes('product') && !h.includes('中文')
                                                );
                                                if (englishCol) fixedRow[englishCol] = value;

                                                // Also fill Chinese column if empty (better than nothing)
                                                const chineseCol = canonicalHeaders.find(h =>
                                                    h.includes('产品名称') && (h.includes('中文') || h.includes('chinese'))
                                                );
                                                if (chineseCol && !fixedRow[chineseCol]) {
                                                    fixedRow[chineseCol] = value; // Use English as fallback
                                                }
                                            }
                                        }
                                        // SPECIFICATION mapping
                                        else if (aiKeyLower.includes('specification') || aiKeyLower.includes('model') ||
                                            aiKeyLower.includes('quantity') || aiKeyLower.includes('standard')) {
                                            if (hasChinese(value)) {
                                                // Chinese specification
                                                const chineseCol = canonicalHeaders.find(h =>
                                                    h.includes('规格') && (h.includes('中文') || h.includes('chinese'))
                                                );
                                                if (chineseCol) fixedRow[chineseCol] = value;
                                            } else {
                                                // English specification
                                                const englishCol = canonicalHeaders.find(h =>
                                                    h.includes('规格') && h.includes('英文')
                                                ) || canonicalHeaders.find(h =>
                                                    h.toLowerCase().includes('specification') && !h.includes('中文')
                                                );
                                                if (englishCol) fixedRow[englishCol] = value;

                                                // Also fill Chinese column if empty
                                                const chineseCol = canonicalHeaders.find(h =>
                                                    h.includes('规格') && (h.includes('中文') || h.includes('chinese'))
                                                );
                                                if (chineseCol && !fixedRow[chineseCol]) {
                                                    fixedRow[chineseCol] = value;
                                                }
                                            }
                                        }
                                        // CERTIFICATE/REGISTRATION NUMBER mapping
                                        else if (aiKeyLower.includes('certificate') || aiKeyLower.includes('registration') ||
                                            aiKeyLower.includes('approval') || aiKeyLower.includes('no')) {
                                            // Check if value starts with "NO." (English format) or contains Chinese
                                            if (value.toUpperCase().startsWith('NO.') || value.includes('NO.')) {
                                                // English certificate number
                                                const englishCol = canonicalHeaders.find(h =>
                                                    (h.includes('注册证') || h.includes('certificate')) && h.includes('英文')
                                                );
                                                if (englishCol) fixedRow[englishCol] = value;
                                            } else if (hasChinese(value) || /^[国苏]械/.test(value)) {
                                                // Chinese certificate number (starts with 国械 or 苏械)
                                                const chineseCol = canonicalHeaders.find(h =>
                                                    (h.includes('注册证') || h.includes('certificate')) && (h.includes('中文') || h.includes('chinese'))
                                                );
                                                if (chineseCol) fixedRow[chineseCol] = value;
                                            } else {
                                                // Ambiguous - try to place in English column
                                                const englishCol = canonicalHeaders.find(h =>
                                                    (h.includes('注册证') || h.includes('certificate')) && h.includes('英文')
                                                );
                                                if (englishCol) fixedRow[englishCol] = value;
                                            }
                                        }
                                        // SERIAL NUMBER mapping (序号)
                                        else if (aiKeyLower.includes('no') && !aiKeyLower.includes('certificate')) {
                                            const serialCol = canonicalHeaders.find(h => h.includes('序号'));
                                            if (serialCol) fixedRow[serialCol] = value;
                                        }
                                    });

                                    console.log(`✅ [Row ${rowIndex}] SMART REPAIR applied (enhanced content-aware mapping)`);
                                    console.log(`   Result: [${Object.values(fixedRow).map(v => String(v).substring(0, 30)).join(' | ')}]`);
                                    return fixedRow;
                                }

                                // VALIDATION: If AI returned fewer values than expected columns, ALERT
                                if (rowValues.length < canonicalHeaders.length) {
                                    console.error(`❌ [Row ${rowIndex}] AI DROPPED COLUMNS! Expected ${canonicalHeaders.length}, got ${rowValues.length}`);
                                    console.error(`   Missing: ${canonicalHeaders.length - rowValues.length} columns`);
                                }

                                const fixedRow: any = {};

                                // Strict Positional Mapping: Index 0 -> Header 0
                                // CRITICAL FIX: Disable this for STRICT TABLES (Table 1) to avoid "Shifting" (Desfase)
                                // Only allow Index Mapping if we don't have strict headers (Dynamic Table 2) OR if explicitly allowed.
                                const isStrictTable = !!tableHeaderMap[key];

                                if (isStrictTable) {
                                    console.warn(`[Row ${rowIndex}] Skipping Positional Mapping for Strict Table to prevent shifting.`);
                                    // For strict tables, if Key Matching failed (above), leave empty.
                                    // Do NOT force Index 0 -> Col 0 if keys don't match.
                                } else {
                                    // Dynamic Tables (Table 2): Fallback to index mapping if keys completely fail
                                    canonicalHeaders.forEach((header, index) => {
                                        if (!fixedRow[header] && index < rowValues.length) { // Only fill if empty
                                            fixedRow[header] = rowValues[index];
                                        }
                                    });
                                }
                                canonicalHeaders.forEach((header, index) => {
                                    if (index < rowValues.length) {
                                        fixedRow[header] = rowValues[index];
                                    } else {
                                        // If no value for this column index, leave empty/null
                                        fixedRow[header] = "";
                                    }
                                });

                                console.log(`[Row ${rowIndex}] Mapped result:`, fixedRow);
                                return fixedRow;
                            });

                            const appended = [...existing, ...normalizedNewRows];
                            mergedAiData[key] = appended;
                            mergedUserData[key] = appended;
                            return; // Skip standard replace
                        } else if (Array.isArray(existing)) {
                            // Existing is empty array [], just use new value
                            mergedAiData[key] = value;
                            mergedUserData[key] = value;
                            return;
                        }
                    }

                    // Standard Replace
                    mergedAiData[key] = value;
                    mergedUserData[key] = value; // Auto-update user editable field too
                }
            });

            // Update DB
            const { error: updateError } = await supabase
                .from('project_documents')
                .update({
                    extracted_data: mergedAiData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', document.id);

            if (updateError) throw updateError;

            // Update Local State (No Reload)
            setDocument((prev: any) => ({ ...prev, extracted_data: mergedAiData }));
            setFormData(mergedUserData);

            alert('Datos extraídos y guardados correctamente.');

        } catch (error: any) {
            console.error(error);
            alert('Error al re-analizar: ' + error.message);
        } finally {
            setProcessingAI(false);
        }
    }

    const handleExtractPage = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Convert canvas key part to base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // High quality JPEG
        // Remove prefix slightly risky but Edge Function expects generic base64 or definition? 
        // Actually Edge function usually handles data URLs or might need pure base64. 
        // Let's check Edge Function logic later, but usually sending the whole DataURL is safer if logic supports it.
        // Or pure Base64. Let's send DataURL and ensure Edge Function handles it.

        await handleRetryAI(dataUrl);
    };

    // Validation Check

    // Validation Check
    const allRequiredValid = document?.definition?.fields?.every((f: any) => {
        if (!f.is_required) return true;
        const val = formData[f.key_identifier];
        return val && String(val).trim() !== '';
    });

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;
    if (!document) return <div>Documento no encontrado</div>;

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-neutral-50">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-neutral-500 hover:text-neutral-900">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
                    </Button>
                    <div className="h-6 w-px bg-neutral-200" />
                    <div>
                        <h1 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
                            {document.definition.name}
                            <Badge variant={document.status === 'VALID' ? 'default' : 'outline'} className="ml-2">
                                {document.status}
                            </Badge>
                        </h1>
                        <p className="text-xs text-neutral-400">ID: {document.id.slice(0, 8)}</p>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center space-x-2 mr-2 bg-white px-2 py-1 rounded border border-neutral-200">
                        <Checkbox id="append-mode" checked={appendMode} onCheckedChange={(v: any) => setAppendMode(!!v)} />
                        <Label
                            htmlFor="append-mode"
                            className="text-xs text-neutral-600 font-medium cursor-pointer select-none"
                            title="Si está activo, los nuevos datos detectados se agregarán al final de las tablas existentes (ideal para tablas de múltiples páginas). Si está inactivo, se sobrescribirá la tabla."
                        >
                            Anidar tablas (Append)
                        </Label>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => handleRetryAI()} disabled={processingAI || saving}>
                        {processingAI ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2 text-blue-600" />}
                        Re-analizar con IA
                    </Button>

                    <div className="h-8 w-px bg-neutral-200 mx-2" />

                    <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleSave(false)} disabled={saving}>
                        <XCircle className="h-4 w-4 mr-2" /> Rechazar
                    </Button>

                    <Button
                        className={`shadow-md transition-all ${!allRequiredValid ? 'opacity-50 cursor-not-allowed bg-neutral-400' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg'}`}
                        onClick={() => handleSave(true)}
                        disabled={saving || !allRequiredValid}
                        title={!allRequiredValid ? "Completa los campos obligatorios para continuar" : "Guardar y Validar"}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        Confirmar y Validar
                    </Button>
                </div>
            </div>

            {/* Core Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Document Viewer */}
                <div
                    className="w-1/2 bg-neutral-100 border-r relative flex flex-col group overflow-hidden"
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-md transition-opacity opacity-50 group-hover:opacity-100">
                        Documento Original {fileUrl?.toLowerCase().includes('.pdf') && `(Pág ${pageNum} de ${totalPages})`}
                    </div>

                    {fileUrl ? (
                        fileUrl.toLowerCase().includes('.pdf') ? (
                            <div className="flex flex-col h-full">
                                {/* PDF Canvas Container */}
                                <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-200/50">
                                    <canvas ref={canvasRef} className="shadow-lg" />
                                </div>

                                {/* PDF Controls */}
                                <div className="bg-white border-t p-2 flex items-center justify-between shrink-0 z-20">
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={prevPage} disabled={pageNum <= 1}>
                                            <ArrowLeft className="h-4 w-4 mr-1" /> Anterior
                                        </Button>
                                        <span className="text-xs text-neutral-500 font-medium w-20 text-center">
                                            {pageNum} / {totalPages || '--'}
                                        </span>
                                        <Button variant="outline" size="sm" onClick={nextPage} disabled={pageNum >= totalPages}>
                                            Siguiente <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-1 border-l pl-2 ml-2 mr-auto">
                                        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} title="Zoom Out">
                                            <ZoomOut className="h-4 w-4" />
                                        </Button>
                                        <span className="text-xs text-neutral-500 w-12 text-center">{Math.round(scale * 100)}%</span>
                                        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(3.0, s + 0.25))} title="Zoom In">
                                            <ZoomIn className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleExtractPage}
                                        disabled={processingAI || !pdfDoc}
                                        className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                                    >
                                        {processingAI ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2" />}
                                        Extraer esta página
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                                <img src={fileUrl} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg" />
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-neutral-400 flex-col gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
                            <p>Cargando documento...</p>
                        </div>
                    )}
                </div>

                {/* Right: Field Validator */}
                <div className="w-1/2 flex flex-col bg-slate-50">
                    <div className="p-4 border-b bg-white shadow-sm z-10">

                        {/* Progress Dashboard */}
                        {document.definition.fields.length > 0 && (
                            <div className="bg-white border rounded-lg p-4 shadow-sm mb-2">
                                {(() => {
                                    const total = document.definition.fields.length;
                                    // Count fields that have a value in formData
                                    const completed = document.definition.fields.filter((f: any) =>
                                        formData[f.key_identifier] && String(formData[f.key_identifier]).trim() !== ''
                                    ).length;

                                    const progress = Math.round((completed / total) * 100);

                                    return (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <div className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-1">Progreso de Validación</div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl font-bold text-neutral-900">{completed}</span>
                                                        <span className="text-sm text-neutral-400">/ {total} campos</span>
                                                    </div>
                                                </div>
                                                <div className={`text-right ${progress === 100 ? 'text-emerald-600' : 'text-neutral-600'}`}>
                                                    <span className="text-xl font-bold">{progress}%</span>
                                                    <div className="text-[10px] text-neutral-400">Completado</div>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-emerald-500'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <div className="flex justify-between items-center px-1">
                            <h2 className="text-sm font-semibold text-neutral-700">Campos a Revisar</h2>
                            <span className="text-xs text-neutral-400">Edita los valores si es necesario</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                        {document.definition.fields.length === 0 && (
                            <div className="text-center py-10 border-2 border-dashed border-neutral-200 rounded-xl bg-white">
                                <p className="text-neutral-400 font-medium">Este documento no requiere extracción de datos.</p>
                                <p className="text-xs text-neutral-300 mt-1">Puedes validarlo directamente.</p>
                            </div>
                        )}

                        {document.definition.fields
                            .filter((f: { is_visible_to_analyst?: boolean }) => currentUserRole !== 'ANALYST' || f.is_visible_to_analyst)
                            .map((field: any) => {
                                // Compute Header Map for this field (should be memoized ideally, but fast enough here)
                                // CRITICAL FIX: Match the logic used in handleRetryAI - STRICT key check only.
                                const isMainProductTableRender = field.key_identifier === 'tablas1';

                                const specificHeaders = isMainProductTableRender ? [
                                    "序号 NO",
                                    "产品名称（中文）Product(s)（chinese)",
                                    "产品名称（英文）Product(s)",
                                    "规格型号（中文）Specification/model（chinese)",
                                    "规格型号（英文）Specification/mode",
                                    "产品注册证或备案凭证号(中文) Registration certificate(s)",
                                    "产品注册证或备案凭证号(英文) Registration certificate(s)"
                                ] : [];

                                const aiValue = document.extracted_data?.[field.key_identifier] || '';
                                const currentValue = formData[field.key_identifier] || '';

                                // Status Logic
                                const hasAiValue = aiValue !== '' && aiValue !== null && aiValue !== undefined;

                                // Robust comparison for Objects/Arrays vs Strings
                                const normalizeVal = (v: any) => {
                                    if (v === null || v === undefined) return '';
                                    if (typeof v === 'object') return JSON.stringify(v);
                                    return String(v).trim();
                                };

                                const isModified = normalizeVal(currentValue) !== normalizeVal(aiValue);
                                const isEmpty = !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '') || (Array.isArray(currentValue) && currentValue.length === 0);
                                const isMatch = !isModified && hasAiValue;

                                return (
                                    <div key={field.id} className={`group bg-white rounded-lg p-3 border transition-all shadow-sm ${isEmpty && field.is_required
                                        ? 'border-amber-300 ring-1 ring-amber-100'
                                        : 'border-neutral-200 hover:border-emerald-300'
                                        }`}>
                                        {/* Header */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex flex-col">
                                                <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                                                    {field.name}
                                                    {field.is_required && <span className="text-red-500" title="Obligatorio">*</span>}
                                                </label>
                                                {field.description && (
                                                    <span className="text-[10px] text-neutral-400 max-w-[200px] truncate">{field.description}</span>
                                                )}
                                            </div>
                                            <Badge variant="secondary" className="text-[10px] font-mono text-neutral-400 bg-neutral-50 border-neutral-100">
                                                {field.key_identifier}
                                            </Badge>
                                        </div>

                                        {/* SPECIAL LAYOUT FOR TABLES (Full Width) */}
                                        {(field.field_type === 'table' || field.field_type === 'structured_table') ? (
                                            <div className="mt-2">
                                                {/* AI Banner for Tables */}
                                                {hasAiValue && Array.isArray(aiValue) && (
                                                    <div className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded text-xs text-blue-700 mb-2 border border-blue-100">
                                                        <span className="flex items-center gap-2">
                                                            <Bot className="h-4 w-4" />
                                                            Tabla detectada ({aiValue.length} filas)
                                                        </span>
                                                        {isModified && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-6 bg-white border-blue-200 hover:bg-blue-100 text-blue-700"
                                                                onClick={() => handleFieldChange(field.key_identifier, aiValue)}
                                                            >
                                                                <ArrowLeft className="h-3 w-3 mr-1" />
                                                                Restaurar Original (IA)
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                                <TableField
                                                    fieldId={field.key_identifier}
                                                    currentValue={currentValue}
                                                    onChange={(json) => handleFieldChange(field.key_identifier, json)}
                                                    fixedHeaders={specificHeaders}
                                                />
                                            </div>
                                        ) : (
                                            /* STANDARD GRID LAYOUT FOR NORMAL FIELDS */
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                                {/* AI VALUE (Read Only) */}
                                                <div className="space-y-1 relative">
                                                    <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium flex items-center gap-1">
                                                        <Bot className="h-3 w-3" /> Detectado (IA)
                                                    </div>
                                                    <Textarea
                                                        readOnly
                                                        value={hasAiValue ? String(aiValue) : ''}
                                                        className={`min-h-[80px] w-full resize-y bg-neutral-50 text-neutral-600 ${!hasAiValue ? 'italic text-neutral-400' : ''}`}
                                                        placeholder={hasAiValue ? '' : 'No detectado'}
                                                        rows={3}
                                                    />

                                                    {/* AI Status Indicator */}
                                                    {/* AI Status Indicator - MOVED TO NEXT COLUMN */}
                                                </div>

                                                {/* FINAL VALUE (Editable) */}
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium flex items-center gap-1">
                                                            <Edit className="h-3 w-3" /> Valor Final
                                                        </div>
                                                        {/* MOVED STATUS BADGE HERE */}
                                                        {hasAiValue && (
                                                            <div className="flex items-center">
                                                                {isModified ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-5 px-2 text-[10px] bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                                                        title="Usar valor detectado por IA"
                                                                        onClick={() => handleFieldChange(field.key_identifier, String(aiValue))}
                                                                    >
                                                                        <ArrowLeft className="h-3 w-3 mr-1" />
                                                                        Restaurar IA
                                                                    </Button>
                                                                ) : (
                                                                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100 shadow-sm">
                                                                        <CheckCircle className="h-3 w-3" />
                                                                        <span className="text-[10px] font-medium">Coincide</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {field.field_type === 'file' ? (
                                                        <FileUploadField
                                                            fieldId={field.key_identifier}
                                                            projectId={projectId as string}
                                                            docId={docId as string}
                                                            currentValue={currentValue}
                                                            onChange={(path) => handleFieldChange(field.key_identifier, path)}
                                                        />
                                                    ) : (
                                                        <div className="relative group/field">
                                                            <Textarea
                                                                value={currentValue}
                                                                onChange={(e) => handleFieldChange(field.key_identifier, e.target.value)}
                                                                className={`transition-all font-medium pr-8 min-h-[80px] w-full resize-y ${isModified
                                                                    ? 'border-emerald-500 focus:ring-emerald-200 bg-emerald-50/10 text-emerald-900'
                                                                    : 'border-neutral-200 focus:border-emerald-500'
                                                                    }`}
                                                                placeholder="Ingresa el valor correcto..."
                                                                rows={3}
                                                            />
                                                            {(currentValue && String(currentValue).length > 0) && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="absolute right-1 top-2 h-6 w-6 text-neutral-400 hover:text-blue-600 opacity-50 group-hover/field:opacity-100 transition-opacity bg-white/50 hover:bg-white"
                                                                    onClick={() => setViewField({ name: field.name, content: String(currentValue) })}
                                                                    title="Ver contenido completo"
                                                                >
                                                                    <Eye className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                );
                            })}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t bg-white flex justify-between items-center text-xs text-neutral-400">
                        <span>
                            Revisa todos los campos antes de confirmar.
                        </span>
                        <span>
                            ID: {document.id.slice(0, 8)}
                        </span>
                    </div>
                </div>
            </div>

            <Dialog open={!!viewField} onOpenChange={(open) => !open && setViewField(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{viewField?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="p-4 bg-neutral-50 rounded border text-sm max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                            {viewField?.content}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
