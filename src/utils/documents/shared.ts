/**
 * Helpers shared by the document generators (text, PDF, DOCX, PPTX).
 */

export type GeneratedFileType = 'txt' | 'md' | 'csv' | 'json' | 'pdf' | 'docx' | 'pptx';

export type GeneratedFileTypeDefinition = {
    extension: GeneratedFileType;
    mimeType: string;
    /** Human readable type shown under the filename on the download card */
    label: string;
    /** Short badge text on the download card eg: "DOC" */
    badge: string;
    /** Badge colours on the download card */
    badgeBackground: string;
    badgeText: string;
};

export const GENERATED_FILE_TYPES: Record<GeneratedFileType, GeneratedFileTypeDefinition> = {
    txt: { extension: 'txt', mimeType: 'text/plain', label: 'Text File', badge: 'TXT', badgeBackground: '#E4E4E7', badgeText: '#3F3F46' },
    md: { extension: 'md', mimeType: 'text/markdown', label: 'Markdown', badge: 'MD', badgeBackground: '#E4E4E7', badgeText: '#3F3F46' },
    csv: { extension: 'csv', mimeType: 'text/csv', label: 'Spreadsheet', badge: 'CSV', badgeBackground: '#DCFCE7', badgeText: '#15803D' },
    json: { extension: 'json', mimeType: 'application/json', label: 'JSON', badge: 'JSON', badgeBackground: '#E4E4E7', badgeText: '#3F3F46' },
    pdf: { extension: 'pdf', mimeType: 'application/pdf', label: 'PDF Document', badge: 'PDF', badgeBackground: '#FEE2E2', badgeText: '#B91C1C' },
    docx: { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word Document', badge: 'DOC', badgeBackground: '#DBEAFE', badgeText: '#1D4ED8' },
    pptx: { extension: 'pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint', badge: 'PPT', badgeBackground: '#FFEDD5', badgeText: '#C2410C' },
};

const FALLBACK_FILE_TYPE: GeneratedFileTypeDefinition = {
    extension: 'txt',
    mimeType: 'application/octet-stream',
    label: 'File',
    badge: 'FILE',
    badgeBackground: '#E4E4E7',
    badgeText: '#3F3F46',
};

/** Look up how to describe a file from its name - unknown extensions get a generic badge */
export function fileTypeForFilename(filename: string): GeneratedFileTypeDefinition {
    const extension = extensionOf(filename);
    if (extension && extension in GENERATED_FILE_TYPES) return GENERATED_FILE_TYPES[extension as GeneratedFileType];
    return { ...FALLBACK_FILE_TYPE, badge: (extension || 'FILE').toUpperCase().slice(0, 4) };
}

/** Lowercase extension without the dot, or '' when there is none */
export function extensionOf(filename: string): string {
    const match = /\.([a-z0-9]+)$/i.exec(filename ?? '');
    return match ? match[1].toLowerCase() : '';
}

/**
 * Make a model-supplied filename safe to show and to write to a shared folder: strip any
 * directory part, drop characters filesystems and share targets reject, and guarantee the
 * expected extension.
 */
export function sanitizeFilename(filename: string | undefined | null, extension: string, fallbackStem = 'document'): string {
    const base = String(filename ?? '').split(/[\\/]/).pop() ?? '';
    let stem = base.replace(new RegExp(`\\.${extension}$`, 'i'), '');
    // eslint-disable-next-line no-control-regex
    stem = stem.replace(/[<>:"|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    if (!stem) stem = fallbackStem;
    return `${stem.slice(0, 120)}.${extension}`;
}

/**
 * Removes characters that are illegal in XML 1.0. OOXML files (.docx/.pptx) embed text straight
 * into XML parts; a stray control character (most often a form feed from a LaTeX `\f`) makes Office
 * refuse to open an otherwise valid file. Applied to everything the model hands us before it is
 * written into a part.
 */
export function stripInvalidXmlChars(value: string): string {
    // eslint-disable-next-line no-control-regex
    return String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** Escape text for use inside an XML text node or attribute value */
export function escapeXml(value: string): string {
    return stripInvalidXmlChars(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Treat a hex colour ("#1E293B" or "1E293B") as dark when its luminance is under 50% */
export function isDarkColor(hexColor: string): boolean {
    const hex = (hexColor || 'FFFFFF').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Hex colour without the leading hash, uppercase - the form OOXML wants */
export function ooxmlColor(hexColor: string): string {
    return (hexColor || '000000').replace('#', '').toUpperCase();
}

/** Byte length of a base64 payload without decoding it */
export function base64ByteLength(base64: string): number {
    const clean = base64.replace(/[\r\n=]/g, '');
    return Math.floor((clean.length * 3) / 4);
}

/** ISO timestamp without milliseconds - the form docProps/core.xml wants */
export function ooxmlTimestamp(date = new Date()): string {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Human readable "12.3 KB" for tool results and logs */
export function formatKilobytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(2)}KB`;
}
