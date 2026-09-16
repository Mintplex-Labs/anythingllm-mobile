import { Platform } from 'react-native';
import type { DocumentKind, ResolvedDocument } from './types';

export const MIME = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    html: 'text/html',
    csv: 'text/csv',
    markdown: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    text: 'text/plain',
    octetStream: 'application/octet-stream',
} as const;

/**
 * File extension → kind. Extensions are checked before mime types because Android content
 * providers routinely report `application/octet-stream` (or nothing) for markdown, csv and
 * other text-like files, while the extension is almost always right.
 */
const EXTENSION_KINDS: Record<string, ResolvedDocument> = {
    pdf: { kind: 'pdf', mimeType: MIME.pdf },
    docx: { kind: 'docx', mimeType: MIME.docx },
    xlsx: { kind: 'spreadsheet', mimeType: MIME.xlsx },
    xlsm: { kind: 'spreadsheet', mimeType: MIME.xlsx },
    xls: { kind: 'spreadsheet', mimeType: MIME.xls },
    ods: { kind: 'spreadsheet', mimeType: MIME.ods },
    pptx: { kind: 'pptx', mimeType: MIME.pptx },
    html: { kind: 'html', mimeType: MIME.html },
    htm: { kind: 'html', mimeType: MIME.html },
    csv: { kind: 'text', mimeType: MIME.csv },
    tsv: { kind: 'text', mimeType: 'text/tab-separated-values' },
    md: { kind: 'text', mimeType: MIME.markdown },
    markdown: { kind: 'text', mimeType: MIME.markdown },
    txt: { kind: 'text', mimeType: MIME.text },
    json: { kind: 'text', mimeType: MIME.json },
    xml: { kind: 'text', mimeType: MIME.xml },
    yaml: { kind: 'text', mimeType: 'application/yaml' },
    yml: { kind: 'text', mimeType: 'application/yaml' },
    log: { kind: 'text', mimeType: MIME.text },
    rtf: { kind: 'text', mimeType: 'text/rtf' },
};

/** Mime type → kind, used when the extension is missing or unknown. */
const MIME_KINDS: Record<string, DocumentKind> = {
    [MIME.pdf]: 'pdf',
    [MIME.docx]: 'docx',
    [MIME.xlsx]: 'spreadsheet',
    'application/vnd.ms-excel.sheet.macroenabled.12': 'spreadsheet',
    [MIME.xls]: 'spreadsheet',
    [MIME.ods]: 'spreadsheet',
    [MIME.pptx]: 'pptx',
    [MIME.html]: 'html',
    'application/xhtml+xml': 'html',
    [MIME.json]: 'text',
    [MIME.xml]: 'text',
    'application/yaml': 'text',
    'application/x-yaml': 'text',
};

/**
 * Mime types handed to the Android document picker (Intent EXTRA_MIME_TYPES). `text/*` is a
 * wildcard the picker honours, so csv/markdown/json-ish text files show up without listing each.
 */
export const SUPPORTED_MIME_TYPES: string[] = [
    'text/*',
    MIME.pdf,
    MIME.docx,
    MIME.xlsx,
    'application/vnd.ms-excel.sheet.macroenabled.12',
    MIME.xls,
    MIME.ods,
    MIME.pptx,
    MIME.json,
    MIME.xml,
    'application/yaml',
    'application/x-yaml',
];

/**
 * Uniform Type Identifiers for the iOS picker, which takes UTTypes rather than mime strings (a
 * mime string is silently dropped by `UTType(_:)`). `public.text` is the parent of plain text,
 * csv, markdown, html, json, xml and yaml, so it covers every `text` kind above in one entry.
 */
export const SUPPORTED_UTIS: string[] = [
    'public.text',
    'com.adobe.pdf',
    'org.openxmlformats.wordprocessingml.document',
    'org.openxmlformats.spreadsheetml.sheet',
    'com.microsoft.excel.xls',
    'org.oasis-open.opendocument.spreadsheet',
    'org.openxmlformats.presentationml.presentation',
];

/** The `type` option for `pick()` on the current platform. */
export const PICKER_FILE_TYPES: string[] = Platform.OS === 'ios' ? SUPPORTED_UTIS : SUPPORTED_MIME_TYPES;

/** Legacy binary Office formats we deliberately do not parse; surfaced with a clearer error. */
const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'ppt', 'dot', 'pps']);

export function getExtension(fileName: string | null | undefined): string {
    if (!fileName) return '';
    const idx = fileName.lastIndexOf('.');
    if (idx === -1 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
}

export class UnsupportedDocumentError extends Error {
    constructor(fileName: string, mimeType: string) {
        const ext = getExtension(fileName);
        const label = ext ? `.${ext}` : (mimeType || 'unknown type');
        const hint = LEGACY_OFFICE_EXTENSIONS.has(ext)
            ? ` Re-save it as .${ext}x and try again.`
            : '';
        super(`Unsupported file type (${label}).${hint}`);
        this.name = 'UnsupportedDocumentError';
    }
}

/**
 * Work out how a picked file should be parsed. Returns null when we have no extractor for it so
 * callers can refuse the file instead of reading binary garbage as UTF-8.
 */
export function resolveDocument(fileName: string | null | undefined, mimeType: string | null | undefined): ResolvedDocument | null {
    const ext = getExtension(fileName);
    if (ext && EXTENSION_KINDS[ext]) return EXTENSION_KINDS[ext];

    const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
    if (mime && MIME_KINDS[mime]) return { kind: MIME_KINDS[mime], mimeType: mime };
    if (mime.startsWith('text/')) return { kind: 'text', mimeType: mime };
    return null;
}
