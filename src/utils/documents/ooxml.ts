import JSZip from 'jszip';
import { escapeXml, ooxmlTimestamp } from './shared';

/**
 * Bits every Office Open XML package (.docx / .pptx) needs regardless of content.
 * The format-specific builders add their own parts on top of these.
 */

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export type OoxmlPart = {
    /** Path inside the zip eg: "word/document.xml" */
    path: string;
    /** Full XML (or binary) body. Strings are written as utf8, Uint8Array as raw bytes */
    body: string | Uint8Array;
};

export type ContentTypeOverride = { partName: string; contentType: string };
export type ContentTypeDefault = { extension: string; contentType: string };

export function contentTypesXml(defaults: ContentTypeDefault[], overrides: ContentTypeOverride[]): string {
    const defaultXml = defaults.map(d => `<Default Extension="${d.extension}" ContentType="${d.contentType}"/>`).join('');
    const overrideXml = overrides.map(o => `<Override PartName="${o.partName}" ContentType="${o.contentType}"/>`).join('');
    return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultXml}${overrideXml}</Types>`;
}

export type Relationship = { id: string; type: string; target: string; targetMode?: 'External' };

export function relationshipsXml(relationships: Relationship[]): string {
    const body = relationships
        .map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeXml(r.target)}"${r.targetMode ? ` TargetMode="${r.targetMode}"` : ''}/>`)
        .join('');
    return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

export const REL_TYPES = {
    officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
    coreProperties: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    extendedProperties: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
    styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
    settings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
    header: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
    footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
    hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
    slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
    theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',
    viewProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps',
    tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
} as const;

export const CONTENT_TYPES = {
    rels: 'application/vnd.openxmlformats-package.relationships+xml',
    xml: 'application/xml',
    png: 'image/png',
    core: 'application/vnd.openxmlformats-package.core-properties+xml',
    app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
} as const;

/** The package-level `_rels/.rels` pointing at the main document part and the doc props */
export function packageRelationshipsXml(mainPartPath: string): string {
    return relationshipsXml([
        { id: 'rId1', type: REL_TYPES.officeDocument, target: mainPartPath },
        { id: 'rId2', type: REL_TYPES.coreProperties, target: 'docProps/core.xml' },
        { id: 'rId3', type: REL_TYPES.extendedProperties, target: 'docProps/app.xml' },
    ]);
}

export function corePropertiesXml({ title, creator, description }: { title: string; creator: string; description?: string }): string {
    const now = ooxmlTimestamp();
    return `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${escapeXml(title)}</dc:title>` +
        `<dc:creator>${escapeXml(creator)}</dc:creator>` +
        (description ? `<dc:description>${escapeXml(description)}</dc:description>` : '') +
        `<cp:lastModifiedBy>${escapeXml(creator)}</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        `</cp:coreProperties>`;
}

export function appPropertiesXml(application: string): string {
    return `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
        `<Application>${escapeXml(application)}</Application><Company>AnythingLLM</Company></Properties>`;
}

/** Decode a base64 string into raw bytes (JSZip wants bytes for binary parts) */
/* eslint-disable no-bitwise */
export function base64ToBytes(base64: string): Uint8Array {
    const clean = base64.replace(/^data:[^,]+,/, '').replace(/[\r\n]/g, '');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array((clean.length * 3) / 4 - padding);
    let byteIndex = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const chunk = (lookup[clean.charCodeAt(i)] << 18) | (lookup[clean.charCodeAt(i + 1)] << 12) | (lookup[clean.charCodeAt(i + 2)] << 6) | lookup[clean.charCodeAt(i + 3)];
        if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 16) & 0xff;
        if (byteIndex < bytes.length) bytes[byteIndex++] = (chunk >> 8) & 0xff;
        if (byteIndex < bytes.length) bytes[byteIndex++] = chunk & 0xff;
    }
    return bytes;
}
/* eslint-enable no-bitwise */

/**
 * Zip the parts into an OOXML package and return it base64 encoded, ready for
 * `RNFS.writeFile(path, base64, 'base64')`. `[Content_Types].xml` must be the first entry.
 */
export async function packOoxml(parts: OoxmlPart[]): Promise<string> {
    const zip = new JSZip();
    for (const part of parts) {
        if (typeof part.body === 'string') zip.file(part.path, part.body);
        else zip.file(part.path, part.body, { binary: true });
    }
    return zip.generateAsync({
        type: 'base64',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        mimeType: 'application/zip',
    });
}
