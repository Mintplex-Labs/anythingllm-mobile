import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib';
import { marked } from 'marked';
import { toWinAnsi, toAscii, unescapeHtml, stripHtml } from './encoding';

/**
 * A tiny flow-layout engine on top of pdf-lib.
 *
 * pdf-lib only knows how to draw primitives, so this file owns everything that
 * makes the transcript look like a document: word wrapping of mixed bold/italic/
 * code runs, page breaks, and a block renderer for the markdown token tree that
 * `marked` produces (headings, lists, code fences, quotes, tables, rules).
 */

export const PAGE_SIZE = { width: 595.28, height: 841.89 }; // A4 portrait in points
/** Bottom margin is generous so body text never collides with the branding watermark */
export const PAGE_MARGIN = { top: 56, right: 48, bottom: 78, left: 48 };

export const COLORS = {
  text: rgb(0.13, 0.13, 0.15),
  muted: rgb(0.55, 0.55, 0.58),
  faint: rgb(0.85, 0.85, 0.87),
  link: rgb(0.16, 0.42, 0.75),
  codeBackground: rgb(0.955, 0.955, 0.965),
  codeText: rgb(0.2, 0.2, 0.24),
  quoteBar: rgb(0.78, 0.78, 0.82),
  quoteText: rgb(0.38, 0.38, 0.42),
  userLabel: rgb(0.16, 0.42, 0.75),
  assistantLabel: rgb(0.36, 0.28, 0.72),
};

export type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
};

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const [regular, bold, italic, boldItalic, mono, monoBold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
    doc.embedFont(StandardFonts.Courier),
    doc.embedFont(StandardFonts.CourierBold),
  ]);
  return { regular, bold, italic, boldItalic, mono, monoBold };
}

/** A span of text with uniform styling */
export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Monospace. Inline code gets a padded pill; set `block` for fenced code */
  code?: boolean;
  /** Fenced code block - whitespace is significant and there is no per-span pill */
  block?: boolean;
  strike?: boolean;
  link?: string;
  color?: RGB;
};

/** Horizontal padding inside an inline code pill */
const CODE_PAD = 2;

type LinePart = { text: string; run: Run; width: number };
type Line = { parts: LinePart[]; width: number };

export type TextOptions = {
  size: number;
  color?: RGB;
  /** Multiplier on font size */
  lineHeight?: number;
  x?: number;
  width?: number;
  /** Called for every rendered line - used for quote bars and code backgrounds */
  decorateLine?: (page: PDFPage, x: number, top: number, height: number, width: number) => void;
};

const BODY_SIZE = 10.5;
const LINE_HEIGHT = 1.45;
const HEADING_SIZES: Record<number, number> = { 1: 18, 2: 15.5, 3: 13.5, 4: 12, 5: 11, 6: 10.5 };
const LIST_INDENT = 18;
const QUOTE_INDENT = 14;
/** Side (pt) of each attachment thumbnail tile and the gap between tiles */
const THUMBNAIL_SIZE = 72;
const THUMBNAIL_GAP = 6;

/** An image attachment as stored on a chat row - only the data URL is needed here */
export type PdfImageAttachment = { name?: string; contentString?: string };

export class PdfWriter {
  readonly doc: PDFDocument;
  readonly fonts: Fonts;
  page!: PDFPage;
  /** Current baseline cursor measured from the bottom of the page (pdf coordinates) */
  y = 0;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.addPage();
  }

  get contentLeft() {
    return PAGE_MARGIN.left;
  }

  get contentWidth() {
    return PAGE_SIZE.width - PAGE_MARGIN.left - PAGE_MARGIN.right;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
    this.y = PAGE_SIZE.height - PAGE_MARGIN.top;
  }

  /** Start a new page if `height` more points would run into the bottom margin */
  ensureSpace(height: number) {
    if (this.y - height < PAGE_MARGIN.bottom) this.addPage();
  }

  /** Vertical whitespace. Never carries over onto a fresh page so pages start flush */
  space(height: number) {
    if (this.y >= PAGE_SIZE.height - PAGE_MARGIN.top) return;
    if (this.y - height < PAGE_MARGIN.bottom) return this.addPage();
    this.y -= height;
  }

  fontFor(run: Run): PDFFont {
    if (run.code) return run.bold ? this.fonts.monoBold : this.fonts.mono;
    if (run.bold && run.italic) return this.fonts.boldItalic;
    if (run.bold) return this.fonts.bold;
    if (run.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  measure(text: string, run: Run, size: number): number {
    const font = this.fontFor(run);
    const fontSize = run.code ? size * 0.92 : size;
    const padding = run.code && !run.block ? CODE_PAD * 2 : 0;
    try {
      return font.widthOfTextAtSize(text, fontSize) + padding;
    } catch {
      return font.widthOfTextAtSize(toAscii(text), fontSize) + padding;
    }
  }

  /**
   * Break styled runs into lines that fit `maxWidth`. Words are the unit of
   * wrapping; a single word wider than the line is split by character.
   */
  wrap(runs: Run[], size: number, maxWidth: number): Line[] {
    const lines: Line[] = [];
    let current: Line = { parts: [], width: 0 };

    const pushLine = () => {
      // trim trailing whitespace so right edges are clean
      while (current.parts.length) {
        const last = current.parts[current.parts.length - 1];
        if (last.text.trim().length) break;
        current.width -= last.width;
        current.parts.pop();
      }
      lines.push(current);
      current = { parts: [], width: 0 };
    };

    const append = (text: string, run: Run, width: number) => {
      const last = current.parts[current.parts.length - 1];
      if (last && last.run === run) {
        last.text += text;
        last.width += width;
      } else current.parts.push({ text, run, width });
      current.width += width;
    };

    for (const run of runs) {
      const paragraphs = run.text.split('\n');
      paragraphs.forEach((paragraph, paragraphIndex) => {
        if (paragraphIndex > 0) pushLine();
        // Inline code is kept whole so its pill is one shape; everything else wraps on whitespace
        const words = run.code && !run.block ? [paragraph] : paragraph.split(/(\s+)/).filter(Boolean);
        for (const word of words) {
          const isSpace = !word.trim().length;
          // no leading whitespace on a wrapped line - except in code blocks where indentation matters
          if (isSpace && current.parts.length === 0 && !run.block) continue;
          const width = this.measure(word, run, size);

          if (current.width + width <= maxWidth || isSpace) {
            append(word, run, width);
            continue;
          }

          if (current.parts.length) pushLine();
          if (width <= maxWidth) {
            append(word, run, width);
            continue;
          }

          // Word is wider than the whole line - split it character by character
          let chunk = '';
          let chunkWidth = 0;
          for (const char of word) {
            const charWidth = this.measure(char, run, size);
            if (chunkWidth + charWidth > maxWidth && chunk) {
              append(chunk, run, chunkWidth);
              pushLine();
              chunk = '';
              chunkWidth = 0;
            }
            chunk += char;
            chunkWidth += charWidth;
          }
          if (chunk) append(chunk, run, chunkWidth);
        }
      });
    }
    if (current.parts.length || lines.length === 0) pushLine();
    return lines;
  }

  private drawSegment(text: string, x: number, y: number, run: Run, size: number, color: RGB) {
    const font = this.fontFor(run);
    const fontSize = run.code ? size * 0.92 : size;
    const options = { x, y, size: fontSize, font, color: run.color ?? color };
    try {
      this.page.drawText(text, options);
    } catch {
      this.page.drawText(toAscii(text), options);
    }
  }

  /** Render already wrapped lines, breaking pages between lines as needed */
  drawLines(lines: Line[], options: TextOptions) {
    const { size, color = COLORS.text, lineHeight = LINE_HEIGHT, x = this.contentLeft, width = this.contentWidth, decorateLine } = options;
    const step = size * lineHeight;

    for (const line of lines) {
      this.ensureSpace(step);
      const top = this.y;
      const baseline = top - size * 1.05;
      decorateLine?.(this.page, x, top, step, width);

      let cursor = x;
      for (const part of line.parts) {
        const partColor = part.run.link ? COLORS.link : part.run.color ?? color;
        const isInlineCode = part.run.code && !part.run.block;
        if (isInlineCode) {
          // subtle pill behind inline code so it reads as code without a mono-only look
          this.page.drawRectangle({
            x: cursor,
            y: baseline - size * 0.25,
            width: part.width,
            height: size * 1.15,
            color: COLORS.codeBackground,
          });
        }
        this.drawSegment(part.text, cursor + (isInlineCode ? CODE_PAD : 0), baseline, part.run, size, partColor);
        if (part.run.strike) {
          this.page.drawLine({
            start: { x: cursor, y: baseline + size * 0.3 },
            end: { x: cursor + part.width, y: baseline + size * 0.3 },
            thickness: 0.6,
            color: partColor,
          });
        }
        if (part.run.link) {
          this.page.drawLine({
            start: { x: cursor, y: baseline - 1.5 },
            end: { x: cursor + part.width, y: baseline - 1.5 },
            thickness: 0.5,
            color: COLORS.link,
            opacity: 0.6,
          });
        }
        cursor += part.width;
      }
      this.y -= step;
    }
  }

  /** Wrap and draw runs in one go */
  drawRuns(runs: Run[], options: TextOptions) {
    const width = options.width ?? this.contentWidth;
    const lines = this.wrap(runs, options.size, width);
    this.drawLines(lines, { ...options, width });
  }

  drawText(text: string, options: TextOptions & Partial<Omit<Run, 'text'>>) {
    const { bold, italic, code, strike, link, ...textOptions } = options;
    this.drawRuns([{ text: toWinAnsi(text), bold, italic, code, strike, link }], textOptions);
  }

  drawRule(color: RGB = COLORS.faint, thickness = 0.75) {
    this.ensureSpace(thickness + 2);
    this.page.drawLine({
      start: { x: this.contentLeft, y: this.y },
      end: { x: this.contentLeft + this.contentWidth, y: this.y },
      thickness,
      color,
    });
    this.y -= thickness + 2;
  }

  /**
   * Draw image attachments as a row of small square thumbnails, wrapping onto
   * further rows when there are more than fit across the content width. Each
   * image is scaled to fit inside its tile (letterboxed, never cropped) so the
   * whole picture is visible. Anything pdf-lib can't decode falls back to a
   * muted `[image: name]` line so the export never fails on a bad payload.
   */
  async drawImages(attachments: PdfImageAttachment[]) {
    const embedded: { image: PDFImage; name?: string }[] = [];
    const failed: string[] = [];
    for (const attachment of attachments) {
      const dataUrl = attachment?.contentString;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) continue;
      try {
        embedded.push({ image: await this.embedImage(dataUrl), name: attachment.name });
      } catch {
        failed.push(attachment.name || 'image');
      }
    }

    const perRow = Math.max(1, Math.floor((this.contentWidth + THUMBNAIL_GAP) / (THUMBNAIL_SIZE + THUMBNAIL_GAP)));
    for (let start = 0; start < embedded.length; start += perRow) {
      this.ensureSpace(THUMBNAIL_SIZE);
      const top = this.y;
      embedded.slice(start, start + perRow).forEach(({ image }, column) => {
        const tileX = this.contentLeft + column * (THUMBNAIL_SIZE + THUMBNAIL_GAP);
        this.page.drawRectangle({ x: tileX, y: top - THUMBNAIL_SIZE, width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, color: COLORS.codeBackground });
        const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        this.page.drawImage(image, {
          x: tileX + (THUMBNAIL_SIZE - width) / 2,
          y: top - THUMBNAIL_SIZE + (THUMBNAIL_SIZE - height) / 2,
          width,
          height,
        });
      });
      this.y = top - THUMBNAIL_SIZE - THUMBNAIL_GAP;
    }

    for (const name of failed) {
      this.drawText(`[image: ${name}]`, { size: 9, italic: true, color: COLORS.muted });
    }
  }

  /** pdf-lib only decodes JPEG and PNG - anything else (HEIC, WebP, GIF) throws here */
  private embedImage(dataUrl: string): Promise<PDFImage> {
    const mime = dataUrl.slice(5, dataUrl.indexOf(';')).toLowerCase();
    if (mime === 'image/jpeg' || mime === 'image/jpg') return this.doc.embedJpg(dataUrl);
    if (mime === 'image/png') return this.doc.embedPng(dataUrl);
    throw new Error(`Unsupported image type: ${mime}`);
  }

  /**
   * Render a markdown string as document blocks.
   * Anything marked can't classify still ends up on the page as plain text.
   */
  drawMarkdown(markdown: string, options: { x?: number; width?: number; size?: number } = {}) {
    let tokens: marked.TokensList | marked.Token[];
    try {
      tokens = marked.lexer(markdown ?? '', { gfm: true, breaks: true });
    } catch {
      this.drawText(markdown ?? '', { size: options.size ?? BODY_SIZE, x: options.x, width: options.width });
      return;
    }
    this.renderBlocks(tokens, {
      x: options.x ?? this.contentLeft,
      width: options.width ?? this.contentWidth,
      size: options.size ?? BODY_SIZE,
      color: COLORS.text,
    });
  }

  // ---------------------------------------------------------------------------
  // Block rendering
  // ---------------------------------------------------------------------------

  private renderBlocks(tokens: marked.Token[], ctx: BlockContext) {
    tokens.forEach((token, index) => {
      const isLast = index === tokens.length - 1;
      this.renderBlock(token, ctx, isLast);
    });
  }

  private renderBlock(token: marked.Token, ctx: BlockContext, isLast: boolean) {
    const gap = ctx.size * 0.55;
    switch (token.type) {
      case 'space':
        return;
      case 'heading': {
        const size = HEADING_SIZES[token.depth] ?? BODY_SIZE;
        this.space(size * 0.5);
        this.drawRuns(inlineToRuns(token.tokens, { bold: true }), { size, x: ctx.x, width: ctx.width, color: ctx.color, lineHeight: 1.3 });
        if (!isLast) this.space(size * 0.35);
        return;
      }
      case 'paragraph':
      case 'text': {
        const runs = 'tokens' in token && token.tokens?.length
          ? inlineToRuns(token.tokens)
          : [{ text: toWinAnsi(unescapeHtml(token.text)) }];
        this.drawRuns(runs, { size: ctx.size, x: ctx.x, width: ctx.width, color: ctx.color });
        if (!isLast) this.space(gap);
        return;
      }
      case 'code':
        this.renderCodeBlock(token.text, ctx);
        if (!isLast) this.space(gap);
        return;
      case 'blockquote':
        this.renderBlocks(token.tokens, {
          ...ctx,
          x: ctx.x + QUOTE_INDENT,
          width: ctx.width - QUOTE_INDENT,
          color: COLORS.quoteText,
          decorateLine: (page, x, top, height) => {
            page.drawRectangle({ x: x - QUOTE_INDENT + 3, y: top - height, width: 2.5, height, color: COLORS.quoteBar });
          },
        });
        if (!isLast) this.space(gap);
        return;
      case 'list':
        this.renderList(token, ctx);
        if (!isLast) this.space(gap);
        return;
      case 'hr':
        this.space(gap * 0.5);
        this.drawRule();
        this.space(gap * 0.5);
        return;
      case 'table':
        this.renderTable(token, ctx);
        if (!isLast) this.space(gap);
        return;
      case 'html': {
        const text = stripHtml(token.text).trim();
        if (!text) return;
        this.drawText(text, { size: ctx.size, x: ctx.x, width: ctx.width, color: ctx.color });
        if (!isLast) this.space(gap);
        return;
      }
      case 'def':
        return;
      default: {
        const raw = 'raw' in token ? (token as any).raw : (token as any).text;
        if (!raw) return;
        this.drawText(String(raw), { size: ctx.size, x: ctx.x, width: ctx.width, color: ctx.color });
        if (!isLast) this.space(gap);
      }
    }
  }

  private renderCodeBlock(code: string, ctx: BlockContext) {
    const size = ctx.size * 0.9;
    const padding = 7;
    const run: Run = { text: toWinAnsi(code.replace(/\n$/, '')), code: true, block: true };
    const lines = this.wrap([run], size, ctx.width - padding * 2);

    const paint = (page: PDFPage, x: number, top: number, height: number, width: number) => {
      page.drawRectangle({ x, y: top - height, width, height, color: COLORS.codeBackground });
    };

    // top padding, body, bottom padding - each painted separately so page breaks stay seamless
    this.ensureSpace(padding + size * LINE_HEIGHT);
    paint(this.page, ctx.x, this.y, padding, ctx.width);
    this.y -= padding;
    this.drawLines(lines, {
      size,
      x: ctx.x + padding,
      width: ctx.width - padding * 2,
      color: COLORS.codeText,
      lineHeight: 1.4,
      decorateLine: (page, x, top, height, width) => paint(page, x - padding, top, height, width + padding * 2),
    });
    this.ensureSpace(padding);
    paint(this.page, ctx.x, this.y, padding, ctx.width);
    this.y -= padding;
  }

  private renderList(list: marked.Tokens.List, ctx: BlockContext) {
    const start = typeof list.start === 'number' ? list.start : 1;
    list.items.forEach((item, index) => {
      const marker = item.task
        ? item.checked ? '[x]' : '[ ]'
        : list.ordered ? `${start + index}.` : '•';

      this.ensureSpace(ctx.size * LINE_HEIGHT);
      const markerRun: Run = { text: marker };
      const markerWidth = this.measure(marker, markerRun, ctx.size);
      const baseline = this.y - ctx.size * 1.05;
      // right-align ordered markers so "9." and "10." line up on the dot
      const markerX = list.ordered ? ctx.x + LIST_INDENT - 5 - markerWidth : ctx.x + 3;
      this.drawSegment(marker, markerX, baseline, markerRun, ctx.size, ctx.color);
      ctx.decorateLine?.(this.page, ctx.x, this.y, ctx.size * LINE_HEIGHT, ctx.width);

      const itemTokens = item.tokens?.length ? item.tokens : [{ type: 'text', text: item.text, raw: item.text } as marked.Token];
      this.renderBlocks(itemTokens, { ...ctx, x: ctx.x + LIST_INDENT, width: ctx.width - LIST_INDENT });
      if (index < list.items.length - 1) this.space(ctx.size * 0.2);
    });
  }

  private renderTable(table: marked.Tokens.Table, ctx: BlockContext) {
    const columns = Math.max(table.header.length, 1);
    const cellPadding = 4;
    const columnWidth = ctx.width / columns;
    const size = ctx.size * 0.92;
    const step = size * LINE_HEIGHT;

    const drawRow = (cells: marked.Tokens.TableCell[], isHeader: boolean) => {
      const wrapped = cells.map(cell => this.wrap(inlineToRuns(cell.tokens, isHeader ? { bold: true } : {}), size, columnWidth - cellPadding * 2));
      const rowLines = Math.max(1, ...wrapped.map(lines => lines.length));
      const rowHeight = rowLines * step + cellPadding * 2;
      this.ensureSpace(Math.min(rowHeight, PAGE_SIZE.height - PAGE_MARGIN.top - PAGE_MARGIN.bottom));

      const top = this.y;
      if (isHeader) this.page.drawRectangle({ x: ctx.x, y: top - rowHeight, width: ctx.width, height: rowHeight, color: COLORS.codeBackground });

      wrapped.forEach((lines, columnIndex) => {
        this.y = top - cellPadding;
        this.drawLines(lines, { size, x: ctx.x + columnIndex * columnWidth + cellPadding, width: columnWidth - cellPadding * 2, color: ctx.color });
      });

      this.y = top - rowHeight;
      this.page.drawLine({
        start: { x: ctx.x, y: this.y },
        end: { x: ctx.x + ctx.width, y: this.y },
        thickness: isHeader ? 0.9 : 0.5,
        color: COLORS.faint,
      });
    };

    drawRow(table.header, true);
    table.rows.forEach(row => drawRow(row, false));
  }
}

type BlockContext = {
  x: number;
  width: number;
  size: number;
  color: RGB;
  decorateLine?: TextOptions['decorateLine'];
};

/** Flatten marked inline tokens into styled runs */
export function inlineToRuns(tokens: marked.Token[] | undefined, style: Omit<Run, 'text'> = {}): Run[] {
  const runs: Run[] = [];
  if (!tokens) return runs;
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        if ('tokens' in token && token.tokens?.length) runs.push(...inlineToRuns(token.tokens, style));
        else runs.push({ ...style, text: toWinAnsi(unescapeHtml(token.text)) });
        break;
      case 'escape':
        runs.push({ ...style, text: toWinAnsi(unescapeHtml(token.text)) });
        break;
      case 'strong':
        runs.push(...inlineToRuns(token.tokens, { ...style, bold: true }));
        break;
      case 'em':
        runs.push(...inlineToRuns(token.tokens, { ...style, italic: true }));
        break;
      case 'del':
        runs.push(...inlineToRuns(token.tokens, { ...style, strike: true }));
        break;
      case 'codespan':
        runs.push({ ...style, text: toWinAnsi(unescapeHtml(token.text)), code: true });
        break;
      case 'br':
        runs.push({ ...style, text: '\n' });
        break;
      case 'link': {
        const inner = inlineToRuns(token.tokens, { ...style, link: token.href });
        runs.push(...(inner.length ? inner : [{ ...style, text: toWinAnsi(token.href), link: token.href }]));
        break;
      }
      case 'image':
        runs.push({ ...style, text: toWinAnsi(token.text ? `[image: ${token.text}]` : '[image]'), italic: true, color: COLORS.muted });
        break;
      case 'html':
        runs.push({ ...style, text: toWinAnsi(stripHtml(token.text)) });
        break;
      default: {
        const raw = (token as any).text ?? (token as any).raw;
        if (raw) runs.push({ ...style, text: toWinAnsi(String(raw)) });
      }
    }
  }
  return runs;
}
