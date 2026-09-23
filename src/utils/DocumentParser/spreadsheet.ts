import * as XLSX from 'xlsx';

/**
 * Convert every sheet of a workbook (xlsx, xlsm, xls, ods) into a CSV block headed by the sheet
 * name. CSV keeps rows and columns legible to the model while staying compact.
 */
export function extractSpreadsheet(bytes: Uint8Array): string {
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
    const sections: string[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
        if (!csv) continue;
        sections.push(`## ${sheetName}\n${csv}`);
    }
    return sections.join('\n\n').trim();
}
