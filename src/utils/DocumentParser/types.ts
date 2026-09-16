/**
 * The kinds of documents the app knows how to turn into plain text. Every kind maps to exactly
 * one extractor in the registry. `pdf` is handled by the native PdfParserModule, everything else
 * is parsed in JS so it works identically on Android and iOS.
 */
export type DocumentKind = 'pdf' | 'docx' | 'spreadsheet' | 'pptx' | 'html' | 'text';

export interface ResolvedDocument {
    kind: DocumentKind;
    /** Canonical mime type for the resolved kind (used for telemetry and the attachment record). */
    mimeType: string;
}
