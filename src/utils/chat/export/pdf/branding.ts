import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ANYTHING_LLM_LOGO_PNG_BASE64 } from './logo';

/**
 * Applies AnythingLLM branding to every page of a PDF - a faded wordmark with a
 * small "created with" caption above it, bottom right. Mirrors the desktop
 * `create-files/pdf/utils.js` plugin so exports look the same across platforms.
 */
export async function applyBranding(pdfDoc: PDFDocument): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const pages = pdfDoc.getPages();

  let logoImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  try {
    logoImage = await pdfDoc.embedPng(ANYTHING_LLM_LOGO_PNG_BASE64);
  } catch {
    logoImage = null;
  }

  const logoWidth = 80;
  const logoHeight = logoImage ? (logoImage.height / logoImage.width) * logoWidth : 0;
  const marginRight = 20;
  const marginBottom = 20;
  const gray = rgb(0.6, 0.6, 0.6);

  for (const page of pages) {
    const { width } = page.getSize();

    if (logoImage) {
      const createdWithText = 'created with';
      const fontSize = 7;
      const textWidth = font.widthOfTextAtSize(createdWithText, fontSize);
      const logoX = width - marginRight - logoWidth;

      page.drawText(createdWithText, {
        x: logoX + (logoWidth - textWidth) / 2,
        y: marginBottom + logoHeight + 2,
        size: fontSize,
        font,
        color: gray,
        opacity: 0.6,
      });

      page.drawImage(logoImage, {
        x: logoX,
        y: marginBottom,
        width: logoWidth,
        height: logoHeight,
        opacity: 0.6,
      });
    } else {
      const fallbackText = 'Created with AnythingLLM';
      const fontSize = 9;
      const textWidth = font.widthOfTextAtSize(fallbackText, fontSize);
      page.drawText(fallbackText, {
        x: width - marginRight - textWidth,
        y: marginBottom,
        size: fontSize,
        font,
        color: gray,
      });
    }
  }
}
