import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, AlertCircle, Maximize2, Download, Upload, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface TableFieldProps {
    fieldId: string;
    currentValue: any; // Accept string (legacy) or object/array (db)
    onChange: (value: any) => void;
    readOnly?: boolean;
    fixedHeaders?: string[]; // New: Enforce specific column order
}

export function TableField({ fieldId, currentValue, onChange, readOnly = false, fixedHeaders }: TableFieldProps) {
    const [data, setData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [viewCell, setViewCell] = useState<{ header: string, content: string } | null>(null);
    const [addColumnOpen, setAddColumnOpen] = useState(false);
    const [newColumnName, setNewColumnName] = useState('');

    // Parse JSON on mount or when value changes externally
    useEffect(() => {
        try {
            // Handle null/undefined/empty
            if (!currentValue) {
                setData([]);
                setHeaders([]);
                setError(null);
                return;
            }

            let parsed: any[] = [];

            // 1. Handle Array (Already parsed)
            if (Array.isArray(currentValue)) {
                parsed = currentValue;
            }
            // 2. Handle Single Object
            else if (typeof currentValue === 'object') {
                parsed = [currentValue];
            }
            // 3. Handle String
            else if (typeof currentValue === 'string') {
                const trimmed = currentValue.trim();
                if (trimmed === '') {
                    setData([]);
                    setHeaders([]);
                    setError(null);
                    return;
                }

                // Guard against "[object Object]"
                if (trimmed === '[object Object]') {
                    console.error("TableField received '[object Object]' string. This usually means a stringification error upstream.");
                    setError("Error: Invalid Data Format ([object Object])");
                    return;
                }

                try {
                    parsed = JSON.parse(trimmed);
                } catch (e) {
                    console.error("JSON Parse Error in TableField:", e, currentValue);
                    setError("Error parsing JSON data");
                    return;
                }
            }

            if (!Array.isArray(parsed)) {
                parsed = [parsed];
            }

            setData(parsed);
            setError(null);

            // Extract headers dynamic or use Fixed Headers
            if (fixedHeaders && fixedHeaders.length > 0) {
                console.log(`[TableField ${fieldId}] Using FIXED HEADERS (${fixedHeaders.length})`, fixedHeaders);
                setHeaders(fixedHeaders || []);
            } else if (parsed.length > 0) {
                const allKeys = new Set<string>();
                parsed.forEach(row => {
                    if (row && typeof row === 'object') {
                        Object.keys(row).forEach(k => allKeys.add(k));
                    }
                });
                const dynamicHeaders = Array.from(allKeys);
                console.log(`[TableField ${fieldId}] Using DYNAMIC HEADERS (${dynamicHeaders.length})`, dynamicHeaders);
                setHeaders(dynamicHeaders);
            } else {
                // Default headers if empty objects or new table
                setHeaders(['Columna 1', 'Columna 2']);
                if (parsed.length === 0) {
                    setData([{ 'Columna 1': '', 'Columna 2': '' }]);
                }
            }
            setError(null);

        } catch (e) {
            console.error("Error parsing table JSON", e);
            setError("Error: El valor actual no es compatible.");
        }
    }, [currentValue, fixedHeaders, fieldId]);

    const updateData = (newData: any[]) => {
        setData(newData);
        onChange(newData); // Return object/array directly, not string
    };

    const handleCellChange = (rowIndex: number, header: string, value: string) => {
        if (readOnly) return;
        const newData = [...data];
        newData[rowIndex] = { ...newData[rowIndex], [header]: value };
        updateData(newData);
    };

    const addRow = () => {
        if (readOnly) return;

        // If no headers exist (empty table), initialize with defaults
        let currentHeaders = [...headers];
        if (currentHeaders.length === 0) {
            const defaults = ['Columna 1', 'Columna 2', 'Columna 3'];
            setHeaders(defaults);
            currentHeaders = defaults;
        }

        const newRow: any = {};
        currentHeaders.forEach(h => newRow[h] = '');
        updateData([...data, newRow]);
    };

    const removeRow = (index: number) => {
        if (readOnly) return;
        const newData = [...data];
        newData.splice(index, 1);
        updateData(newData);
    };

    const handleAddColumn = () => {
        const name = newColumnName.trim();
        if (!name) return;

        if (headers.includes(name)) {
            alert('Ya existe una columna con este nombre.');
            return;
        }

        let newData = [...data];
        if (newData.length === 0) {
            // Initialize with one empty row if table is empty
            const row: any = { [name]: '' };
            headers.forEach(h => row[h] = ''); // Keep existing empty headers?
            newData = [row];
            // Also need to force update headers state?
            // useEffect will pick it up from data keys.
        } else {
            newData = newData.map(row => ({ ...row, [name]: '' }));
        }

        updateData(newData);
        setAddColumnOpen(false);
        setNewColumnName('');
        // Optimistic update of headers to show it immediately
        setHeaders(prev => [...prev, name]);
    };

    if (error) {
        return (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
                <div className="text-[10px] font-mono text-neutral-500 mt-1 block w-full truncate">
                    {currentValue}
                </div>
            </div>
        );
    }

    const handleExportCsv = () => {
        if (!data.length) return;
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${fieldId}_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        if (readOnly) return;
        fileInputRef.current?.click();
    };

    const processImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            // Simple CSV Parser (handles quotes)
            const rows = text.split(/\r?\n/).filter(line => line.trim() !== '');
            const parseCSVLine = (line: string) => {
                const result = [];
                let start = 0;
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === '"') {
                        inQuotes = !inQuotes;
                    } else if (line[i] === ',' && !inQuotes) {
                        let val = line.substring(start, i).trim();
                        if (val.startsWith('"') && val.endsWith('"')) {
                            val = val.substring(1, val.length - 1).replace(/""/g, '"');
                        }
                        result.push(val);
                        start = i + 1;
                    }
                }
                let lastVal = line.substring(start).trim();
                if (lastVal.startsWith('"') && lastVal.endsWith('"')) {
                    lastVal = lastVal.substring(1, lastVal.length - 1).replace(/""/g, '"');
                }
                result.push(lastVal);
                return result;
            };

            if (rows.length === 0) return;

            const csvHeaders = parseCSVLine(rows[0]); // First row is header
            const csvDataRows = rows.slice(1);

            let targetHeaders = headers;

            // logic: If we have fixedHeaders, we adhere to them. 
            // We verify if CSV has matching columns.
            if (fixedHeaders && fixedHeaders.length > 0) {
                targetHeaders = fixedHeaders;
            } else {
                targetHeaders = csvHeaders;
                setHeaders(csvHeaders);
            }

            const formattedData = csvDataRows.map(rowStr => {
                const values = parseCSVLine(rowStr);
                const rowObj: any = {};

                // Map values to headers by INDEX (assuming CSV matches strict order)
                // OR map by NAME if dynamic
                targetHeaders.forEach((h, index) => {
                    // Try to find value by index first
                    // If CSV has headers, try to match by name? 
                    // Simpler approach: Positional mapping usually expected in CSV import.
                    rowObj[h] = values[index] || '';
                });
                return rowObj;
            });

            updateData(formattedData);
            setError(null);

            // Allow re-uploading same file
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handleClearTable = async () => {
        if (!confirm('¿Seguro que quieres limpiar toda la tabla? Esta acción se guardará inmediatamente.')) return;
        updateData([]);
    };

    const TableContent = ({ isDialog = false }) => (
        <div className={`flex flex-col ${isDialog ? 'h-[80vh]' : 'max-h-[500px]'}`}>
            <div className="flex justify-end gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={handleClearTable} title="Borrar todo el contenido" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-1" /> Borrar Todo
                </Button>

                <input
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={processImport}
                />
                <Button variant="outline" size="sm" onClick={handleImportClick} title="Importar CSV">
                    <Upload className="h-4 w-4 mr-1" /> Importar
                </Button>

                <Button variant="outline" size="sm" onClick={handleExportCsv} title="Exportar CSV">
                    <Download className="h-4 w-4 mr-1" /> Exportar
                </Button>
                {!isDialog && (
                    <Button variant="outline" size="sm" onClick={() => setIsMaximized(true)} title="Pantalla Completa">
                        <Maximize2 className="h-4 w-4 mr-1" /> Ampliar
                    </Button>
                )}
            </div>

            <div className={`overflow-auto flex-1 relative border rounded-lg bg-white shadow-sm`}>
                <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 shadow-sm">
                        <tr className="bg-neutral-100 border-b">
                            {headers.map(h => (
                                <th key={h} className="px-3 py-2 text-left font-medium text-neutral-600 min-w-[150px] bg-neutral-100 border-b">
                                    {h}
                                </th>
                            ))}
                            {!readOnly && <th className="w-10 bg-neutral-100 border-b"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={headers.length + 1} className="text-center py-8 text-neutral-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span>No hay datos extraídos en esta tabla.</span>
                                        <span className="text-xs">Usa "Agregar Fila" para comenzar manualmente.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((row, i) => (
                                <tr key={i} className="border-b last:border-0 group hover:bg-neutral-50/50">
                                    {headers.map(h => (
                                        <td key={`${i}-${h}`} className="p-1 border-b">
                                            <div className="relative group/cell">
                                                <Input
                                                    value={row[h] || ''}
                                                    onChange={(e) => handleCellChange(i, h, e.target.value)}
                                                    className="h-8 border-transparent bg-transparent focus:bg-white focus:border-emerald-500 rounded px-2 min-w-[120px] pr-8"
                                                    readOnly={readOnly}
                                                />
                                                {(row[h]?.length > 20 || row[h]?.includes('\n')) && (
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-neutral-400 hover:text-blue-500 opacity-50 group-hover/cell:opacity-100 transition-opacity bg-white/50 hover:bg-white"
                                                        onClick={() => setViewCell({ header: h, content: row[h] })}
                                                        title="Ver contenido completo"
                                                    >
                                                        <Eye className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    ))}
                                    {!readOnly && (
                                        <td className="p-1 text-center border-b">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                onClick={() => removeRow(i)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!readOnly && (
                <div className="p-2 border-t bg-neutral-50 flex justify-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={addRow}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 gap-1"
                    >
                        <Plus className="h-3 w-3" /> Agregar Fila
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddColumnOpen(true)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 gap-1"
                    >
                        <Plus className="h-3 w-3" /> Columna
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <>
            <TableContent />

            <Dialog open={isMaximized} onOpenChange={setIsMaximized}>
                <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Editor de Tabla Completa</DialogTitle>
                    </DialogHeader>
                    <TableContent isDialog={true} />
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewCell} onOpenChange={(open) => !open && setViewCell(null)}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Detalle: {viewCell?.header}</DialogTitle>
                    </DialogHeader>
                    <div className="whitespace-pre-wrap p-4 bg-neutral-50 rounded border overflow-auto flex-1 text-sm font-mono">
                        {viewCell?.content}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={() => setViewCell(null)}>Cerrar</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Agregar Columna</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="colName">Nombre de la columna</Label>
                        <Input
                            id="colName"
                            value={newColumnName}
                            onChange={(e) => setNewColumnName(e.target.value)}
                            placeholder="Ej: Precio Unitario"
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddColumnOpen(false)}>Cancelar</Button>
                        <Button onClick={handleAddColumn}>Agregar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
