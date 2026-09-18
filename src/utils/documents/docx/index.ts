import { type marked } from 'marked';
import { escapeXml } from '../shared';
import {
    CONTENT_TYPES,
    REL_TYPES,
    XML_DECLARATION,
    appPropertiesXml,
    base64ToBytes,
    contentTypesXml,
    corePropertiesXml,
    packOoxml,
    packageRelationshipsXml,
    relationshipsXml,
    type OoxmlPart,
    type Relationship,
} from '../ooxml';
import { firstHeading, inlineTokensToRuns, lexMarkdown, type InlineRun } from '../markdown';
import { ANYTHING_LLM_LOGO_PNG_BASE64 } from '@/utils/chat/export/pdf/logo';
import { DOCX_FONTS, getDocxMargins, getDocxTheme, type DocxMargins, type DocxTheme } from './themes';

export { DOCX_THEME_NAMES, DOCX_MARGIN_NAMES, type DocxThemeName, type DocxMarginName } from './themes';

/**
 * Markdown -> .docx without a document library. Word's WordprocessingML is written directly
 * and zipped with JSZip, which keeps the dependency footprint small and avoids Node-only
 * packages that do not run under Hermes. Styling follows the desktop create-docx-file plugin:
 * themed headings, an optional cover page, a running header with the title and a footer with
 * "Page X of Y" and the AnythingLLM mark.
 */

export type BuildDocxOptions = {
    /** Markdown body */
    content: string;
    /** Document title - falls back to the first heading, then the filename stem */
    title?: string | null;
    subtitle?: string | null;
    author?: string | null;
    theme?: string | null;
    margins?: string | null;
    includeTitlePage?: boolean;
    /** Used as the title of last resort */
    fallbackTitle?: string;
};

// --- Layout constants (twips unless stated) ----------------------------------
const PAGE = { width: 12240, height: 15840 }; // US Letter
const BODY_SIZE = 22; // half-points => 11pt
const CODE_SIZE = 19; // 9.5pt
const LIST_INDENT = 720;
const LIST_HANGING = 360;
const QUOTE_INDENT = 720;
const EMU_PER_INCH = 914400;
// The footer mark is the dark wordmark from the PDF exporter, a 1200x300 PNG (4:1).
const LOGO_WIDTH_IN = 0.9;
const LOGO_ASPECT = 300 / 1200;
const LOGO = { width: Math.round(LOGO_WIDTH_IN * EMU_PER_INCH), height: Math.round(LOGO_WIDTH_IN * LOGO_ASPECT * EMU_PER_INCH) };

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const BULLET_NUM_ID = 1;

/** Resolve a title from the explicit option, the first heading, or a fallback */
export function resolveDocxTitle(options: Pick<BuildDocxOptions, 'title' | 'content' | 'fallbackTitle'>): string {
    const explicit = options.title?.trim();
    if (explicit) return explicit;
    return firstHeading(lexMarkdown(options.content)) ?? options.fallbackTitle ?? 'Document';
}

export async function buildDocxBase64(options: BuildDocxOptions): Promise<string> {
    const theme = getDocxTheme(options.theme);
    const margins = getDocxMargins(options.margins);
    const title = resolveDocxTitle(options);
    const includeTitlePage = !!options.includeTitlePage;

    const body = new DocxBodyWriter(theme, margins);
    body.renderBlocks(lexMarkdown(options.content ?? ''));
    if (body.isEmpty()) body.paragraph(runsXml([{ text: options.content ?? '' }]));

    const documentXml = documentPartXml({ body, theme, margins, title, subtitle: options.subtitle, author: options.author, includeTitlePage });

    const documentRels: Relationship[] = [
        { id: 'rId1', type: REL_TYPES.styles, target: 'styles.xml' },
        { id: 'rId2', type: REL_TYPES.numbering, target: 'numbering.xml' },
        { id: 'rId3', type: REL_TYPES.settings, target: 'settings.xml' },
        { id: 'rId4', type: REL_TYPES.footer, target: 'footer1.xml' },
        { id: 'rId5', type: REL_TYPES.header, target: 'header1.xml' },
        ...body.hyperlinks.map((href, index) => ({ id: hyperlinkRelId(index), type: REL_TYPES.hyperlink, target: href, targetMode: 'External' as const })),
    ];

    const parts: OoxmlPart[] = [
        {
            path: '[Content_Types].xml',
            body: contentTypesXml(
                [
                    { extension: 'rels', contentType: CONTENT_TYPES.rels },
                    { extension: 'xml', contentType: CONTENT_TYPES.xml },
                    { extension: 'png', contentType: CONTENT_TYPES.png },
                ],
                [
                    { partName: '/word/document.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' },
                    { partName: '/word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' },
                    { partName: '/word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml' },
                    { partName: '/word/settings.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml' },
                    { partName: '/word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' },
                    { partName: '/word/footer1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml' },
                    { partName: '/docProps/core.xml', contentType: CONTENT_TYPES.core },
                    { partName: '/docProps/app.xml', contentType: CONTENT_TYPES.app },
                ],
            ),
        },
        { path: '_rels/.rels', body: packageRelationshipsXml('word/document.xml') },
        { path: 'docProps/core.xml', body: corePropertiesXml({ title, creator: options.author?.trim() || 'AnythingLLM Mobile', description: 'Word document generated by AnythingLLM Mobile' }) },
        { path: 'docProps/app.xml', body: appPropertiesXml('AnythingLLM Mobile') },
        { path: 'word/document.xml', body: documentXml },
        { path: 'word/_rels/document.xml.rels', body: relationshipsXml(documentRels) },
        { path: 'word/styles.xml', body: stylesXml(theme) },
        { path: 'word/numbering.xml', body: numberingXml(theme, body.orderedListStarts) },
        { path: 'word/settings.xml', body: settingsXml() },
        { path: 'word/header1.xml', body: headerXml(title, theme) },
        { path: 'word/footer1.xml', body: footerXml(theme) },
        { path: 'word/_rels/footer1.xml.rels', body: relationshipsXml([{ id: 'rIdLogo', type: REL_TYPES.image, target: 'media/logo.png' }]) },
        { path: 'word/media/logo.png', body: base64ToBytes(ANYTHING_LLM_LOGO_PNG_BASE64) },
    ];

    return packOoxml(parts);
}

function hyperlinkRelId(index: number) {
    return `rIdLink${index + 1}`;
}

// -----------------------------------------------------------------------------
// document.xml
// -----------------------------------------------------------------------------

function documentPartXml({
    body,
    theme,
    margins,
    title,
    subtitle,
    author,
    includeTitlePage,
}: {
    body: DocxBodyWriter;
    theme: DocxTheme;
    margins: DocxMargins;
    title: string;
    subtitle?: string | null;
    author?: string | null;
    includeTitlePage: boolean;
}): string {
    const pageSize = `<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/>`;
    const pageMargins = `<w:pgMar w:top="${margins.top}" w:right="${margins.right}" w:bottom="${margins.bottom}" w:left="${margins.left}" w:header="708" w:footer="708" w:gutter="0"/>`;

    let cover = '';
    if (includeTitlePage) {
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const lines = [
            `<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="4800" w:after="240"/></w:pPr>${runsXml([{ text: title }])}</w:p>`,
            subtitle?.trim() ? `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>${runsXml([{ text: subtitle.trim() }])}</w:p>` : '',
            `<w:p><w:pPr><w:spacing w:before="2400" w:after="120"/><w:jc w:val="center"/></w:pPr>${author?.trim() ? runsXml([{ text: author.trim() }], { size: 26 }) : ''}</w:p>`,
            `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${runsXml([{ text: date }], { size: 22, color: theme.footerText })}</w:p>`,
            // The cover is its own section (no header / footer) closed by this paragraph's sectPr
            `<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/>${pageSize}${pageMargins}</w:sectPr></w:pPr></w:p>`,
        ];
        cover = lines.join('');
    }

    const headerRef = includeTitlePage ? '<w:headerReference w:type="default" r:id="rId5"/>' : '';
    const finalSection = `<w:sectPr>${headerRef}<w:footerReference w:type="default" r:id="rId4"/>${pageSize}${pageMargins}</w:sectPr>`;

    return `${XML_DECLARATION}<w:document ${W_NS}><w:body>${cover}${body.xml()}${finalSection}</w:body></w:document>`;
}

// -----------------------------------------------------------------------------
// Body: markdown tokens -> paragraphs / tables
// -----------------------------------------------------------------------------

type BlockContext = {
    /** Paragraph style id applied to plain paragraphs */
    style?: string;
    /** Extra left indent in twips (nested lists, quotes) */
    indent: number;
    /** Numbering to attach to the *first* paragraph of the current list item - cleared once used */
    pendingNumbering?: { numId: number; level: number } | null;
    /** How many lists deep we are - picks the numbering level of nested lists */
    listDepth?: number;
};

class DocxBodyWriter {
    private blocks: string[] = [];
    readonly hyperlinks: string[] = [];
    /** Start number of every ordered list in document order - each gets its own w:num so numbering restarts */
    readonly orderedListStarts: number[] = [];

    constructor(private theme: DocxTheme, private margins: DocxMargins) {}

    isEmpty() {
        return this.blocks.length === 0;
    }

    xml() {
        return this.blocks.join('');
    }

    paragraph(inner: string, pPr = '') {
        this.blocks.push(`<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`);
    }

    renderBlocks(tokens: marked.Token[], ctx: BlockContext = { indent: 0 }) {
        for (const token of tokens) this.renderBlock(token, ctx);
    }

    private paragraphProperties(ctx: BlockContext, extra = ''): string {
        const parts: string[] = [];
        if (ctx.style) parts.push(`<w:pStyle w:val="${ctx.style}"/>`);
        else if (ctx.pendingNumbering) parts.push('<w:pStyle w:val="ListParagraph"/>');
        if (ctx.pendingNumbering) parts.push(`<w:numPr><w:ilvl w:val="${ctx.pendingNumbering.level}"/><w:numId w:val="${ctx.pendingNumbering.numId}"/></w:numPr>`);
        parts.push(extra);
        if (ctx.indent > 0 && !ctx.pendingNumbering) parts.push(`<w:ind w:left="${ctx.indent}"/>`);
        return parts.join('');
    }

    private renderBlock(token: marked.Token, ctx: BlockContext) {
        switch (token.type) {
            case 'space':
            case 'def':
                return;
            case 'heading': {
                const depth = Math.min(Math.max(token.depth, 1), 6);
                this.paragraph(this.runs(inlineTokensToRuns(token.tokens)), this.paragraphProperties({ ...ctx, style: `Heading${depth}` }));
                ctx.pendingNumbering = null;
                return;
            }
            case 'paragraph':
            case 'text': {
                const runs = 'tokens' in token && token.tokens?.length ? inlineTokensToRuns(token.tokens) : [{ text: String(token.text ?? '') }];
                this.paragraph(this.runs(runs), this.paragraphProperties(ctx));
                ctx.pendingNumbering = null;
                return;
            }
            case 'code': {
                this.renderCodeBlock(token.text, ctx);
                ctx.pendingNumbering = null;
                return;
            }
            case 'blockquote': {
                this.renderBlocks(token.tokens, { ...ctx, style: 'Quote', indent: ctx.indent + (ctx.pendingNumbering ? 0 : QUOTE_INDENT), pendingNumbering: null });
                ctx.pendingNumbering = null;
                return;
            }
            case 'list': {
                this.renderList(token, ctx);
                return;
            }
            case 'hr': {
                this.paragraph('', `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${this.theme.border}"/></w:pBdr><w:spacing w:before="120" w:after="120"/>`);
                return;
            }
            case 'table': {
                this.renderTable(token, ctx);
                ctx.pendingNumbering = null;
                return;
            }
            case 'html': {
                const runs = inlineTokensToRuns([token]);
                if (!runs.some(run => run.text.trim())) return;
                this.paragraph(this.runs(runs), this.paragraphProperties(ctx));
                ctx.pendingNumbering = null;
                return;
            }
            default: {
                const raw = (token as any).text ?? (token as any).raw;
                if (!raw) return;
                this.paragraph(this.runs([{ text: String(raw) }]), this.paragraphProperties(ctx));
                ctx.pendingNumbering = null;
            }
        }
    }

    private renderCodeBlock(code: string, ctx: BlockContext) {
        const lines = (code ?? '').replace(/\n$/, '').split('\n');
        const runs = lines.map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr><w:rFonts w:ascii="${DOCX_FONTS.mono}" w:hAnsi="${DOCX_FONTS.mono}" w:cs="${DOCX_FONTS.mono}"/><w:sz w:val="${CODE_SIZE}"/><w:szCs w:val="${CODE_SIZE}"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`).join('');
        const pPr = this.paragraphProperties({ ...ctx, style: 'Code' });
        this.paragraph(runs, pPr);
    }

    private renderList(list: marked.Tokens.List, ctx: BlockContext) {
        const level = Math.min(this.listDepth(ctx), 2);
        let numId = BULLET_NUM_ID;
        if (list.ordered) {
            this.orderedListStarts.push(typeof list.start === 'number' ? list.start : 1);
            numId = BULLET_NUM_ID + this.orderedListStarts.length; // numId 2..n
        }
        for (const item of list.items) {
            const itemTokens: marked.Token[] = item.tokens?.length ? item.tokens : [{ type: 'text', text: item.text, raw: item.text } as marked.Token];
            if (item.task) {
                const first = itemTokens[0];
                const prefix = item.checked ? '☑ ' : '☐ ';
                if (first && 'tokens' in first && Array.isArray(first.tokens)) first.tokens.unshift({ type: 'text', raw: prefix, text: prefix } as marked.Token);
            }
            // A fresh context per item: the first paragraph consumes the numbering, later blocks only indent
            this.renderBlocks(itemTokens, { indent: ctx.indent + LIST_INDENT, pendingNumbering: { numId, level }, listDepth: this.listDepth(ctx) + 1 });
        }
    }

    private listDepth(ctx: BlockContext): number {
        return ctx.listDepth ?? 0;
    }

    private renderTable(table: marked.Tokens.Table, ctx: BlockContext) {
        const columns = Math.max(table.header.length, 1);
        const totalWidth = PAGE.width - this.margins.left - this.margins.right - ctx.indent;
        const columnWidth = Math.floor(totalWidth / columns);
        const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${columnWidth}"/>`).join('')}</w:tblGrid>`;
        const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${this.theme.border}"/>`;
        const tblPr = `<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${totalWidth}" w:type="dxa"/>${ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : ''}<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;

        const cellXml = (cell: marked.Tokens.TableCell, index: number, isHeader: boolean) => {
            const align = table.align?.[index];
            const jc = align ? `<w:jc w:val="${align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'}"/>` : '';
            const shading = isHeader ? `<w:shd w:val="clear" w:color="auto" w:fill="${this.theme.tableHeader}"/>` : '';
            const runs = inlineTokensToRuns(cell.tokens, isHeader ? { bold: true } : {});
            return `<w:tc><w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/>${shading}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/>${jc}</w:pPr>${this.runs(runs, { size: 20 })}</w:p></w:tc>`;
        };
        const rowXml = (cells: marked.Tokens.TableCell[], isHeader: boolean) => {
            const padded = Array.from({ length: columns }, (_, index) => cells[index] ?? { text: '', tokens: [] });
            return `<w:tr>${isHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${padded.map((cell, index) => cellXml(cell, index, isHeader)).join('')}</w:tr>`;
        };

        this.blocks.push(`<w:tbl>${tblPr}${grid}${rowXml(table.header, true)}${table.rows.map(row => rowXml(row, false)).join('')}</w:tbl>`);
        // Word needs a paragraph after a table so following content does not fuse with it
        this.paragraph('', '<w:spacing w:before="0" w:after="120"/>');
    }

    /** Runs with hyperlink wrapping - hyperlink targets are collected for document.xml.rels */
    private runs(runs: InlineRun[], style: RunStyle = {}): string {
        let xml = '';
        let index = 0;
        while (index < runs.length) {
            const run = runs[index];
            if (!run.link) {
                xml += runsXml([run], style);
                index++;
                continue;
            }
            const href = run.link;
            const group: InlineRun[] = [];
            while (index < runs.length && runs[index].link === href) group.push(runs[index++]);
            let relIndex = this.hyperlinks.indexOf(href);
            if (relIndex === -1) relIndex = this.hyperlinks.push(href) - 1;
            xml += `<w:hyperlink r:id="${hyperlinkRelId(relIndex)}">${runsXml(group, { ...style, hyperlink: true })}</w:hyperlink>`;
        }
        return xml;
    }
}

type RunStyle = {
    /** Half-points */
    size?: number;
    /** Hex without hash */
    color?: string;
    hyperlink?: boolean;
};

/** Serialize runs to `<w:r>` elements (newlines become `<w:br/>`) */
function runsXml(runs: InlineRun[], style: RunStyle = {}): string {
    let xml = '';
    for (const run of runs) {
        const rPr: string[] = [];
        if (style.hyperlink) rPr.push('<w:rStyle w:val="Hyperlink"/>');
        if (run.code) rPr.push(`<w:rFonts w:ascii="${DOCX_FONTS.mono}" w:hAnsi="${DOCX_FONTS.mono}" w:cs="${DOCX_FONTS.mono}"/>`);
        if (run.bold) rPr.push('<w:b/><w:bCs/>');
        if (run.italic) rPr.push('<w:i/><w:iCs/>');
        if (run.strike) rPr.push('<w:strike/>');
        if (style.color) rPr.push(`<w:color w:val="${style.color}"/>`);
        const size = run.code ? Math.round((style.size ?? BODY_SIZE) * 0.9) : style.size;
        if (size) rPr.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
        if (run.code) rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>');
        const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';

        const lines = run.text.split('\n');
        lines.forEach((line, lineIndex) => {
            if (lineIndex > 0) xml += `<w:r>${rPrXml}<w:br/></w:r>`;
            if (line.length) xml += `<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`;
        });
    }
    return xml;
}

// -----------------------------------------------------------------------------
// Supporting parts
// -----------------------------------------------------------------------------

function stylesXml(theme: DocxTheme): string {
    const fonts = `<w:rFonts w:ascii="${DOCX_FONTS.body}" w:hAnsi="${DOCX_FONTS.body}" w:eastAsia="${DOCX_FONTS.body}" w:cs="${DOCX_FONTS.body}"/>`;
    const heading = (level: number, size: number, extra = '') =>
        `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
        `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${level <= 2 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
        `<w:rPr><w:rFonts w:ascii="${DOCX_FONTS.heading}" w:hAnsi="${DOCX_FONTS.heading}" w:cs="${DOCX_FONTS.heading}"/><w:b/><w:bCs/>${extra}<w:color w:val="${theme.heading}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

    return `${XML_DECLARATION}<w:styles ${W_NS}>` +
        `<w:docDefaults><w:rPrDefault><w:rPr>${fonts}<w:sz w:val="${BODY_SIZE}"/><w:szCs w:val="${BODY_SIZE}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>` +
        `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
        `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
        `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>` +
        `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
        `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${theme.border}"/></w:tblBorders></w:tblPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${theme.heading}"/><w:sz w:val="64"/><w:szCs w:val="64"/></w:rPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="${theme.accent}"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>` +
        heading(1, 40) + heading(2, 32) + heading(3, 26) + heading(4, 24) + heading(5, 22, '<w:i/><w:iCs/>') + heading(6, 22, '<w:i/><w:iCs/>') +
        `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/><w:contextualSpacing/></w:pPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="${theme.accent}"/></w:pBdr><w:spacing w:before="120" w:after="120"/><w:ind w:left="${QUOTE_INDENT}"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="595959"/></w:rPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepLines/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/></w:pPr><w:rPr><w:rFonts w:ascii="${DOCX_FONTS.mono}" w:hAnsi="${DOCX_FONTS.mono}" w:cs="${DOCX_FONTS.mono}"/><w:sz w:val="${CODE_SIZE}"/><w:szCs w:val="${CODE_SIZE}"/></w:rPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${theme.border}"/></w:pBdr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${theme.footerText}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${theme.footerText}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>` +
        `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="${theme.accent}"/><w:u w:val="single"/></w:rPr></w:style>` +
        `</w:styles>`;
}

function numberingXml(theme: DocxTheme, orderedListStarts: number[]): string {
    const bulletLevel = (level: number, char: string, font: string) =>
        `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${char}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${LIST_INDENT * (level + 1)}" w:hanging="${LIST_HANGING}"/></w:pPr><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/><w:color w:val="${theme.accent}"/></w:rPr></w:lvl>`;
    const numberLevel = (level: number, format: string) =>
        `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${LIST_INDENT * (level + 1)}" w:hanging="${LIST_HANGING}"/></w:pPr></w:lvl>`;

    const bulletAbstract = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bulletLevel(0, '•', 'Symbol')}${bulletLevel(1, 'o', 'Courier New')}${bulletLevel(2, '▪', 'Wingdings')}</w:abstractNum>`;
    const numberAbstract = `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${numberLevel(0, 'decimal')}${numberLevel(1, 'lowerLetter')}${numberLevel(2, 'lowerRoman')}</w:abstractNum>`;

    const bulletNum = `<w:num w:numId="${BULLET_NUM_ID}"><w:abstractNumId w:val="0"/></w:num>`;
    const orderedNums = orderedListStarts
        .map((start, index) => `<w:num w:numId="${BULLET_NUM_ID + index + 1}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${Math.max(1, start)}"/></w:lvlOverride></w:num>`)
        .join('');

    return `${XML_DECLARATION}<w:numbering ${W_NS}>${bulletAbstract}${numberAbstract}${bulletNum}${orderedNums}</w:numbering>`;
}

function settingsXml(): string {
    return `${XML_DECLARATION}<w:settings ${W_NS}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
        `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

function headerXml(title: string, theme: DocxTheme): string {
    return `${XML_DECLARATION}<w:hdr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr>${runsXml([{ text: title }], { color: theme.footerText, size: 18 })}</w:p></w:hdr>`;
}

function fieldRuns(instruction: string, placeholder: string): string {
    return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${placeholder}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function footerXml(theme: DocxTheme): string {
    const logo =
        `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${LOGO.width}" cy="${LOGO.height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="AnythingLLM"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="rIdLogo"><a:alphaModFix amt="60000"/></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO.width}" cy="${LOGO.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const pageNumber = `<w:r><w:t xml:space="preserve">Page </w:t></w:r>${fieldRuns('PAGE', '1')}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${fieldRuns('NUMPAGES', '1')}`;
    const createdWith = `<w:r><w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/></w:r>${runsXml([{ text: 'Created with ' }], { color: theme.footerText, size: 16 })}${logo}`;
    return `${XML_DECLARATION}<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${pageNumber}${createdWith}</w:p></w:ftr>`;
}
