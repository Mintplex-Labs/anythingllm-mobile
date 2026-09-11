import { PDFDocument, type RGB } from 'pdf-lib';
import { PdfWriter, loadFonts, COLORS } from './renderer';
import { applyBranding } from './branding';
import { toWinAnsi } from './encoding';
import { generatedWithLine, formatExportDate, type ThreadExportContext } from '../types';

const BODY_SIZE = 10.5;
const LABEL_SIZE = 8.5;

/**
 * Render a thread to a PDF and return it base64 encoded (ready for RNFS.writeFile).
 *
 * Layout: title block, then each exchange as a small colored role label followed
 * by the message body. User prompts are drawn as plain text (line breaks kept)
 * with any image attachments as a row of thumbnails beneath them;
 * assistant replies go through the markdown renderer so headings, lists, code
 * and tables come out styled. Ends with a light-gray italic "generated with"
 * footer and the AnythingLLM watermark on every page.
 */
export async function buildThreadPdfBase64(ctx: ThreadExportContext): Promise<string> {
  const { workspace, thread, chats, modelName, exportedAt } = ctx;
  const doc = await PDFDocument.create();
  doc.setTitle(thread.name);
  doc.setSubject(`Chat transcript from the "${workspace.name}" workspace`);
  doc.setCreator('AnythingLLM Mobile');
  doc.setProducer('AnythingLLM Mobile');
  doc.setCreationDate(new Date(exportedAt));
  doc.setModificationDate(new Date(exportedAt));

  const fonts = await loadFonts(doc);
  const writer = new PdfWriter(doc, fonts);

  // --- Title block -----------------------------------------------------------
  writer.drawText(thread.name, { size: 20, bold: true, lineHeight: 1.25 });
  writer.space(4);
  writer.drawText(`${workspace.name}  ·  Exported ${formatExportDate(exportedAt)}`, { size: 9, color: COLORS.muted });
  writer.space(8);
  writer.drawRule();
  writer.space(12);

  if (chats.length === 0) {
    writer.drawText('This thread has no messages.', { size: BODY_SIZE, italic: true, color: COLORS.muted });
  }

  // --- Messages --------------------------------------------------------------
  for (const [index, chat] of chats.entries()) {
    drawRoleLabel(writer, 'You', COLORS.userLabel);
    writer.drawText(chat.prompt?.trim() || '(empty)', { size: BODY_SIZE });
    const attachments = chat.response?.attachments;
    if (Array.isArray(attachments) && attachments.length) {
      writer.space(6);
      await writer.drawImages(attachments);
    }
    writer.space(12);

    drawRoleLabel(writer, 'Assistant', COLORS.assistantLabel);
    const response = chat.response?.textResponse?.trim();
    if (response) writer.drawMarkdown(response, { size: BODY_SIZE });
    else writer.drawText('(no response)', { size: BODY_SIZE, italic: true, color: COLORS.muted });

    if (index < chats.length - 1) {
      writer.space(14);
      writer.drawRule();
      writer.space(14);
    }
  }

  // --- Footer ----------------------------------------------------------------
  writer.space(22);
  writer.drawText(generatedWithLine(modelName), { size: 9, italic: true, color: COLORS.muted });

  await applyBranding(doc);
  return doc.saveAsBase64();
}

/** Small uppercase-ish role label that sits above each message body */
function drawRoleLabel(writer: PdfWriter, label: string, color: RGB) {
  // keep the label with at least one line of the message that follows it
  writer.ensureSpace(LABEL_SIZE * 1.4 + BODY_SIZE * 1.45 * 2);
  writer.drawText(toWinAnsi(label.toUpperCase()), { size: LABEL_SIZE, bold: true, color, lineHeight: 1.4 });
  writer.space(2);
}
