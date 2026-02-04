import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

export const generateDocx = async (templateUrl: string, data: any, outputName: string) => {
    try {
        // 1. Load Template
        const response = await fetch(templateUrl);
        if (!response.ok) throw new Error('Failed to download template');
        const content = await response.arrayBuffer();

        // 2. Unzip
        const zip = new PizZip(content);

        // 3. Compile
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        // 4. Render with Data
        doc.render(data);

        // 5. Output
        const blob = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        // 6. Save
        saveAs(blob, outputName); // Trigger download
        return true;
    } catch (error) {
        console.error('Error generating DOCX:', error);
        throw error;
    }
};
