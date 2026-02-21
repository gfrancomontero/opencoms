import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
export async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.pdf':
            return extractPdf(filePath);
        case '.docx':
            return extractDocx(filePath);
        case '.doc':
            return extractDoc(filePath);
        case '.xlsx':
        case '.xls':
            return extractSpreadsheet(filePath);
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}
async function extractPdf(filePath) {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    // pdf-parse will extract all pages; we also track page count
    const data = await pdfParse(buffer);
    return {
        text: data.text,
        pages: data.numpages,
        metadata: {
            pages: data.numpages,
            info: data.info,
        },
    };
}
async function extractDocx(filePath) {
    // Try textutil first (macOS native, handles both .doc and .docx)
    try {
        const text = execSync(`textutil -convert txt -stdout "${filePath}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        return { text, metadata: { method: 'textutil' } };
    }
    catch {
        // Fall back to mammoth
    }
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return {
        text: result.value,
        metadata: { method: 'mammoth' },
    };
}
async function extractDoc(filePath) {
    // Use macOS textutil for .doc files
    try {
        const text = execSync(`textutil -convert txt -stdout "${filePath}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        return { text, metadata: { method: 'textutil' } };
    }
    catch {
        throw new Error('Could not read this .doc file. macOS textutil was unable to convert it. ' +
            'The file might be password-protected or corrupted.');
    }
}
async function extractSpreadsheet(filePath) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);
    const parts = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet)
            continue;
        parts.push(`\n--- Sheet: ${sheetName} ---\n`);
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const rows = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
            const cells = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[addr];
                cells.push(cell ? String(cell.v ?? '') : '');
            }
            if (cells.some((c) => c.trim())) {
                rows.push(`Row ${r + 1}: ${cells.join(' | ')}`);
            }
        }
        parts.push(rows.join('\n'));
    }
    return {
        text: parts.join('\n'),
        metadata: {
            sheets: workbook.SheetNames,
            method: 'xlsx',
        },
    };
}
//# sourceMappingURL=extractor.js.map