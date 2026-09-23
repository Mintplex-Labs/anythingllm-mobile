import { PDFDocument } from 'pdf-lib';
import { PdfWriter, loadFonts } from '@/utils/chat/export/pdf/renderer';
import { applyBranding } from '@/utils/chat/export/pdf/branding';

/**
 * Render a markdown document to a branded PDF (base64). Reuses the flow-layout renderer
 * the thread exporter uses, so generated PDFs and exported threads share one look.
 */
export async function markdownToPdfBase64({ content, title }: { content: string; title: string }): Promise<string> {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setCreator('AnythingLLM Mobile');
    doc.setProducer('AnythingLLM Mobile');
    const now = new Date();
    doc.setCreationDate(now);
    doc.setModificationDate(now);

    const fonts = await loadFonts(doc);
    const writer = new PdfWriter(doc, fonts);
    writer.drawMarkdown(content?.trim() ? content : '(empty document)');

    await applyBranding(doc);
    return doc.saveAsBase64();
}
