import { resolveDocument, getExtension, UnsupportedDocumentError, SUPPORTED_MIME_TYPES, MIME } from '../registry';

describe('getExtension', () => {
    it('returns the lowercase extension', () => {
        expect(getExtension('Report.DOCX')).toBe('docx');
        expect(getExtension('archive.tar.gz')).toBe('gz');
    });
    it('returns empty for no extension', () => {
        expect(getExtension('README')).toBe('');
        expect(getExtension('trailing.')).toBe('');
        expect(getExtension(null)).toBe('');
    });
});

describe('resolveDocument', () => {
    it('prefers the extension over a generic mime type', () => {
        expect(resolveDocument('notes.md', 'application/octet-stream')).toEqual({ kind: 'text', mimeType: MIME.markdown });
        expect(resolveDocument('deck.pptx', null)).toEqual({ kind: 'pptx', mimeType: MIME.pptx });
        expect(resolveDocument('data.xlsx', '')).toEqual({ kind: 'spreadsheet', mimeType: MIME.xlsx });
    });
    it('falls back to the mime type when the extension is unknown', () => {
        expect(resolveDocument('download', MIME.docx)).toEqual({ kind: 'docx', mimeType: MIME.docx });
        expect(resolveDocument('file.bin', 'text/x-python; charset=utf-8')).toEqual({ kind: 'text', mimeType: 'text/x-python' });
    });
    it('rejects files it cannot parse', () => {
        expect(resolveDocument('old.doc', 'application/msword')).toBeNull();
        expect(resolveDocument('photo.png', 'image/png')).toBeNull();
        expect(resolveDocument('', '')).toBeNull();
    });
    it('every picker mime type (minus wildcards) resolves to a kind', () => {
        for (const mime of SUPPORTED_MIME_TYPES) {
            if (mime.includes('*')) continue;
            expect(resolveDocument('file', mime)).not.toBeNull();
        }
    });
});

describe('UnsupportedDocumentError', () => {
    it('hints at re-saving legacy office files', () => {
        expect(new UnsupportedDocumentError('old.doc', 'application/msword').message).toMatch(/\.docx/);
        expect(new UnsupportedDocumentError('img.png', 'image/png').message).toBe('Unsupported file type (.png).');
    });
});
