import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Eye, FileIcon } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import Image from 'next/image';

interface FileUploadFieldProps {
    fieldId: string;
    projectId: string; // Needed for storage path
    docId: string;     // Needed for storage path
    currentValue: string; // This is the storage path currently saved
    onChange: (path: string) => void;
    readOnly?: boolean;
}

export function FileUploadField({ fieldId, projectId, docId, currentValue, onChange, readOnly = false }: FileUploadFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fetch signed URL if we have a stored path
    useEffect(() => {
        let isMounted = true;

        const loadPreview = async () => {
            if (!currentValue) {
                setPreviewUrl(null);
                return;
            }

            try {
                // If it looks like a full URL (legacy or external), use it directly
                if (currentValue.startsWith('http')) {
                    setPreviewUrl(currentValue);
                    return;
                }

                // Otherwise generate signed URL from storage path
                const { data, error } = await supabase.storage
                    .from('project-documents') // Verify bucket name matches your system
                    .createSignedUrl(currentValue, 3600); // 1 hour token

                if (error) throw error;
                if (isMounted) setPreviewUrl(data.signedUrl);
            } catch (err) {
                console.error('Error loading preview:', err);
                if (isMounted) setError('Error cargando imagen');
            }
        };

        loadPreview();

        return () => { isMounted = false; };
    }, [currentValue, supabase]);

    const handleUpload = async (file: File) => {
        if (readOnly) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('Solo se permiten imágenes (JPG, PNG)');
            return;
        }

        // Validate size (e.g. 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError('La imagen no debe pesar más de 5MB');
            return;
        }

        setError(null);
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            // Path format: {projectId}/{docId}/{fieldId}.{ext}
            // Using fieldId ensures one file per field (overwrite)
            const filePath = `${projectId}/${docId}/${fieldId}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('project-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Update parent with the storage path
            onChange(filePath);

        } catch (err: any) {
            console.error('Upload error:', err);
            setError(err.message || 'Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = () => {
        if (readOnly) return;
        onChange('');
        setPreviewUrl(null);
    };

    return (
        <div className="space-y-3">
            {previewUrl ? (
                <div className="relative group border rounded-lg overflow-hidden bg-neutral-100 w-full max-w-[200px] aspect-video flex items-center justify-center">
                    <Image
                        src={previewUrl}
                        alt="Preview"
                        fill
                        className="object-contain"
                    />

                    {!readOnly && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={handleRemove}
                                title="Eliminar imagen"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                            <a
                                href={previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="h-8 w-8 flex items-center justify-center bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-sm"
                                title="Ver original"
                            >
                                <Eye className="h-4 w-4" />
                            </a>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border-2 border-dashed border-neutral-200 hover:border-emerald-400 rounded-lg p-6 transition-colors bg-neutral-50 hover:bg-emerald-50/10 text-center">
                    <input
                        type="file"
                        accept="image/*"
                        disabled={uploading || readOnly}
                        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                        className="hidden"
                        id={`upload-${fieldId}`}
                    />
                    <label
                        htmlFor={readOnly ? undefined : `upload-${fieldId}`}
                        className={`flex flex-col items-center gap-2 ${readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                        {uploading ? (
                            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                        ) : (
                            <div className="p-3 bg-white rounded-full shadow-sm mb-1">
                                <Upload className="h-5 w-5 text-neutral-400" />
                            </div>
                        )}
                        <span className="text-sm font-medium text-neutral-600">
                            {uploading ? 'Subiendo...' : 'Subir imagen'}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                            JPG, PNG (Max 5MB)
                        </span>
                    </label>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
        </div>
    );
}
