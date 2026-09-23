import * as RNFS from '@dr.pogodin/react-native-fs';
import { Buffer } from 'buffer';
import PDFParser from '@/utils/PDFParser';
import { extractDocx } from './docx';
import { extractSpreadsheet } from './spreadsheet';
import { extractPptx } from './pptx';
import { htmlToText } from './html';
import { resolveDocument, UnsupportedDocumentError, SUPPORTED_MIME_TYPES, SUPPORTED_UTIS, PICKER_FILE_TYPES, getExtension } from './registry';
import type { DocumentKind, ResolvedDocument } from './types';

export { resolveDocument, UnsupportedDocumentError, SUPPORTED_MIME_TYPES, SUPPORTED_UTIS, PICKER_FILE_TYPES, getExtension };
export type { DocumentKind, ResolvedDocument };

async function readBytes(path: string): Promise<Uint8Array> {
    const base64 = await RNFS.readFile(path, 'base64');
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function readUtf8(path: string): Promise<string> {
    return await RNFS.readFile(path, 'utf8');
}

/**
 * Turn a picked file into plain text ready for chunking and embedding.
 *
 * @param path Local, readable path to the file (already resolved from any content:// URI).
 * @param fileName Original file name; its extension is the primary signal for the file kind.
 * @param mimeType Mime type reported by the picker; used when the extension is unknown.
 * @throws UnsupportedDocumentError when no extractor exists for the file.
 * @throws Error when the extractor fails or yields no text.
 */
export async function extractText(path: string, fileName: string, mimeType: string): Promise<string> {
    const resolved = resolveDocument(fileName, mimeType);
    if (!resolved) throw new UnsupportedDocumentError(fileName, mimeType);

    let text: string | null;
    switch (resolved.kind) {
        case 'pdf':
            text = (await PDFParser.extract(path))?.textContent ?? null;
            break;
        case 'docx':
            text = await extractDocx(await readBytes(path));
            break;
        case 'spreadsheet':
            text = extractSpreadsheet(await readBytes(path));
            break;
        case 'pptx':
            text = extractPptx(await readBytes(path));
            break;
        case 'html':
            text = htmlToText(await readUtf8(path));
            break;
        case 'text':
        default:
            text = await readUtf8(path);
            break;
    }

    if (!text || !text.trim()) throw new Error('Attachment content was empty or could not be read');
    return text;
}

const DocumentParser = { extractText, resolveDocument, PICKER_FILE_TYPES };
export default DocumentParser;
