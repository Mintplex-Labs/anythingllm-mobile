import { escapeXml, isDarkColor, stripInvalidXmlChars } from '../shared';
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
import { inlineMarkdownToRuns, type InlineRun } from '../markdown';
import { ANYTHING_LLM_LOGO_PNG_BASE64 } from '@/utils/chat/export/pdf/logo';
import { ANYTHING_LLM_LOGO_LIGHT_PNG_BASE64 } from '../logoLight';
import { getPptxTheme, type PptxTheme } from './themes';

export { PPTX_THEME_NAMES, getPptxTheme, type PptxThemeName } from './themes';

/**
 * Slides -> .pptx without a presentation library. PresentationML is written directly and
 * zipped with JSZip. Layout and colours follow the desktop create-pptx-presentation plugin
 * (`create-files/pptx/utils.js`): a 16:9 canvas of 10 x 5.625 in, a dark title slide, section
 * dividers, bullet / table content slides with a footer page count and the AnythingLLM mark.
 */

export type PptxSlideLayout = 'section' | 'content' | 'blank';

export type PptxTable = {
    headers?: string[];
    rows?: string[][];
};

export type PptxSlide = {
    layout?: PptxSlideLayout | 'title';
    title?: string;
    subtitle?: string;
    /** Bullet points - each may carry inline markdown (**bold**, *italic*, `code`) */
    content?: string[];
    /** Speaker notes */
    notes?: string;
    table?: PptxTable;
};

export type BuildPptxOptions = {
    title: string;
    author?: string | null;
    theme?: string | null;
    slides: PptxSlide[];
};

// --- Geometry (inches, converted to EMU on output) ------------------------------
const EMU_PER_INCH = 914400;
const SLIDE = { width: 10, height: 5.625 };
const MARGIN_X = 0.7;
const CONTENT_W = SLIDE.width - MARGIN_X * 2;
// The two wordmarks are cut differently: the light one is 704x99, the dark one 1200x300.
const LOGO_ASPECT = { light: 99 / 704, dark: 300 / 1200 } as const;

const emu = (inches: number) => Math.round(inches * EMU_PER_INCH);
/** Font size in points -> hundredths of a point */
const pt = (points: number) => Math.round(points * 100);

const P_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const REL_NOTES_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const REL_NOTES_MASTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster';

export async function buildPptxBase64(options: BuildPptxOptions): Promise<string> {
    const theme = getPptxTheme(options.theme);
    const title = stripInvalidXmlChars(options.title || 'Untitled Presentation').trim() || 'Untitled Presentation';
    const author = stripInvalidXmlChars(options.author ?? '').trim();
    const contentSlides = Array.isArray(options.slides) ? options.slides : [];
    const totalSlides = contentSlides.length;

    const slideXmls: string[] = [];
    const slideNotes: (string | null)[] = [];

    slideXmls.push(renderTitleSlide({ title, author }, theme));
    slideNotes.push(null);

    contentSlides.forEach((slide, index) => {
        const slideNumber = index + 1;
        const layout = slide.layout ?? 'content';
        if (layout === 'title' || layout === 'section') slideXmls.push(renderSectionSlide(slide, theme, slideNumber, totalSlides));
        else if (layout === 'blank') slideXmls.push(renderBlankSlide(theme, slideNumber, totalSlides));
        else slideXmls.push(renderContentSlide(slide, theme, slideNumber, totalSlides));
        slideNotes.push(slide.notes?.trim() ? slide.notes.trim() : null);
    });

    // --- Assemble the package -------------------------------------------------
    const overrides = [
        { partName: '/ppt/presentation.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml' },
        { partName: '/ppt/slideMasters/slideMaster1.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml' },
        { partName: '/ppt/slideLayouts/slideLayout1.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml' },
        { partName: '/ppt/notesMasters/notesMaster1.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml' },
        { partName: '/ppt/theme/theme1.xml', contentType: 'application/vnd.openxmlformats-officedocument.theme+xml' },
        { partName: '/ppt/theme/theme2.xml', contentType: 'application/vnd.openxmlformats-officedocument.theme+xml' },
        { partName: '/ppt/presProps.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml' },
        { partName: '/ppt/viewProps.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml' },
        { partName: '/ppt/tableStyles.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml' },
        { partName: '/docProps/core.xml', contentType: CONTENT_TYPES.core },
        { partName: '/docProps/app.xml', contentType: CONTENT_TYPES.app },
    ];
    slideXmls.forEach((_, index) => {
        overrides.push({ partName: `/ppt/slides/slide${index + 1}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml' });
        if (slideNotes[index]) overrides.push({ partName: `/ppt/notesSlides/notesSlide${index + 1}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml' });
    });

    const presentationRels: Relationship[] = [
        { id: 'rId1', type: REL_TYPES.slideMaster, target: 'slideMasters/slideMaster1.xml' },
        { id: 'rId2', type: REL_NOTES_MASTER, target: 'notesMasters/notesMaster1.xml' },
        { id: 'rId3', type: REL_TYPES.theme, target: 'theme/theme1.xml' },
        { id: 'rId4', type: REL_TYPES.presProps, target: 'presProps.xml' },
        { id: 'rId5', type: REL_TYPES.viewProps, target: 'viewProps.xml' },
        { id: 'rId6', type: REL_TYPES.tableStyles, target: 'tableStyles.xml' },
        ...slideXmls.map((_, index) => ({ id: slideRelId(index), type: REL_TYPES.slide, target: `slides/slide${index + 1}.xml` })),
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
                overrides,
            ),
        },
        { path: '_rels/.rels', body: packageRelationshipsXml('ppt/presentation.xml') },
        { path: 'docProps/core.xml', body: corePropertiesXml({ title, creator: author || 'AnythingLLM Mobile', description: 'Presentation generated by AnythingLLM Mobile' }) },
        { path: 'docProps/app.xml', body: appPropertiesXml('AnythingLLM Mobile') },
        { path: 'ppt/presentation.xml', body: presentationXml(slideXmls.length) },
        { path: 'ppt/_rels/presentation.xml.rels', body: relationshipsXml(presentationRels) },
        { path: 'ppt/presProps.xml', body: `${XML_DECLARATION}<p:presentationPr ${P_NS}/>` },
        { path: 'ppt/viewProps.xml', body: `${XML_DECLARATION}<p:viewPr ${P_NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
        { path: 'ppt/tableStyles.xml', body: `${XML_DECLARATION}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
        { path: 'ppt/theme/theme1.xml', body: themeXml('AnythingLLM Theme', theme) },
        { path: 'ppt/theme/theme2.xml', body: themeXml('AnythingLLM Notes Theme', theme) },
        { path: 'ppt/slideMasters/slideMaster1.xml', body: slideMasterXml(theme) },
        { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', body: relationshipsXml([{ id: 'rId1', type: REL_TYPES.slideLayout, target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: REL_TYPES.theme, target: '../theme/theme1.xml' }]) },
        { path: 'ppt/slideLayouts/slideLayout1.xml', body: slideLayoutXml() },
        { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', body: relationshipsXml([{ id: 'rId1', type: REL_TYPES.slideMaster, target: '../slideMasters/slideMaster1.xml' }]) },
        { path: 'ppt/notesMasters/notesMaster1.xml', body: notesMasterXml() },
        { path: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', body: relationshipsXml([{ id: 'rId1', type: REL_TYPES.theme, target: '../theme/theme2.xml' }]) },
        { path: 'ppt/media/logo-dark.png', body: base64ToBytes(ANYTHING_LLM_LOGO_PNG_BASE64) },
        { path: 'ppt/media/logo-light.png', body: base64ToBytes(ANYTHING_LLM_LOGO_LIGHT_PNG_BASE64) },
    ];

    slideXmls.forEach((xml, index) => {
        const slideNumber = index + 1;
        const rels: Relationship[] = [
            { id: 'rId1', type: REL_TYPES.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
            { id: LOGO_DARK_REL_ID, type: REL_TYPES.image, target: '../media/logo-dark.png' },
            { id: LOGO_LIGHT_REL_ID, type: REL_TYPES.image, target: '../media/logo-light.png' },
        ];
        const notes = slideNotes[index];
        if (notes) {
            rels.push({ id: 'rIdNotes', type: REL_NOTES_SLIDE, target: `../notesSlides/notesSlide${slideNumber}.xml` });
            parts.push({ path: `ppt/notesSlides/notesSlide${slideNumber}.xml`, body: notesSlideXml(notes) });
            parts.push({
                path: `ppt/notesSlides/_rels/notesSlide${slideNumber}.xml.rels`,
                body: relationshipsXml([
                    { id: 'rId1', type: REL_NOTES_MASTER, target: '../notesMasters/notesMaster1.xml' },
                    { id: 'rId2', type: REL_TYPES.slide, target: `../slides/slide${slideNumber}.xml` },
                ]),
            });
        }
        parts.push({ path: `ppt/slides/slide${slideNumber}.xml`, body: xml });
        parts.push({ path: `ppt/slides/_rels/slide${slideNumber}.xml.rels`, body: relationshipsXml(rels) });
    });

    return packOoxml(parts);
}

function slideRelId(index: number) {
    return `rIdSlide${index + 1}`;
}

const LOGO_DARK_REL_ID = 'rIdLogoDark';
const LOGO_LIGHT_REL_ID = 'rIdLogoLight';

// -----------------------------------------------------------------------------
// Slide shapes
// -----------------------------------------------------------------------------

type TextOptions = {
    x: number;
    y: number;
    w: number;
    h: number;
    size: number;
    color: string;
    font: string;
    bold?: boolean;
    italic?: boolean;
    align?: 'l' | 'ctr' | 'r';
    /** Vertical anchor */
    valign?: 't' | 'ctr' | 'b';
    /** 0-100, percent transparent */
    transparency?: number;
};

/** Builds one slide's shape tree with unique ids */
class SlideBuilder {
    private shapes: string[] = [];
    private nextId = 2;

    constructor(private background: string) {}

    private id() {
        return this.nextId++;
    }

    rect({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
        const id = this.id();
        this.shapes.push(
            `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
            `<p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
            `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
            `<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`,
        );
    }

    text(text: string, options: TextOptions) {
        this.paragraphs([paragraphXml(inlineMarkdownToRuns(text), options)], options);
    }

    /** A text box holding pre-rendered `<a:p>` paragraphs */
    paragraphs(paragraphs: string[], options: Pick<TextOptions, 'x' | 'y' | 'w' | 'h' | 'valign'>) {
        const id = this.id();
        const anchor = options.valign ?? 't';
        this.shapes.push(
            `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
            `<p:spPr><a:xfrm><a:off x="${emu(options.x)}" y="${emu(options.y)}"/><a:ext cx="${emu(options.w)}" cy="${emu(options.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
            `<p:txBody><a:bodyPr wrap="square" lIns="45720" tIns="45720" rIns="45720" bIns="45720" rtlCol="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join('')}</p:txBody></p:sp>`,
        );
    }

    image({ relId, x, y, w, h, transparency = 0 }: { relId: string; x: number; y: number; w: number; h: number; transparency?: number }) {
        const id = this.id();
        const alpha = transparency > 0 ? `<a:alphaModFix amt="${Math.round((100 - transparency) * 1000)}"/>` : '';
        this.shapes.push(
            `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
            `<p:blipFill><a:blip r:embed="${relId}">${alpha}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
            `<p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
        );
    }

    table(table: PptxTable, theme: PptxTheme, { x, y, w }: { x: number; y: number; w: number }) {
        const headers = Array.isArray(table.headers) ? table.headers.map(cell => String(cell ?? '')) : [];
        const rows = Array.isArray(table.rows) ? table.rows.map(row => (Array.isArray(row) ? row.map(cell => String(cell ?? '')) : [String(row ?? '')])) : [];
        const columns = Math.max(headers.length, ...rows.map(row => row.length), 1);
        if (!headers.length && !rows.length) return;

        const rowHeight = 0.4;
        const columnWidth = w / columns;
        const border = (side: string) => `<a:${side} w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${theme.tableBorderColor}"/></a:solidFill><a:prstDash val="solid"/></a:${side}>`;
        const cell = (text: string, { bold, size, color, fill }: { bold: boolean; size: number; color: string; fill: string }) =>
            `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphXml(inlineMarkdownToRuns(text), { size, color, font: theme.fontBody, bold, align: 'l' })}</a:txBody>` +
            `<a:tcPr marL="101600" marR="101600" marT="50800" marB="50800" anchor="ctr">${border('lnL')}${border('lnR')}${border('lnT')}${border('lnB')}<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
        const padRow = (cells: string[]) => Array.from({ length: columns }, (_, index) => cells[index] ?? '');

        const trs: string[] = [];
        if (headers.length) {
            trs.push(`<a:tr h="${emu(rowHeight)}">${padRow(headers).map(text => cell(text, { bold: true, size: 12, color: theme.tableHeaderColor, fill: theme.tableHeaderBg })).join('')}</a:tr>`);
        }
        rows.forEach((row, index) => {
            const fill = index % 2 === 1 ? theme.tableAltRowBg : theme.background;
            trs.push(`<a:tr h="${emu(rowHeight)}">${padRow(row).map(text => cell(text, { bold: false, size: 11, color: theme.bodyColor, fill })).join('')}</a:tr>`);
        });

        const id = this.id();
        const grid = Array.from({ length: columns }, () => `<a:gridCol w="${emu(columnWidth)}"/>`).join('');
        this.shapes.push(
            `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
            `<p:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(rowHeight * trs.length)}"/></p:xfrm>` +
            `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${trs.join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
        );
    }

    xml(): string {
        return `${XML_DECLARATION}<p:sld ${P_NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${this.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>` +
            `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
            `${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    }
}

type ParagraphOptions = {
    size: number;
    color: string;
    font: string;
    bold?: boolean;
    italic?: boolean;
    align?: 'l' | 'ctr' | 'r';
    transparency?: number;
    /** Bullet character + colour - omitted for plain paragraphs */
    bullet?: { char: string; color: string };
    /** Space after the paragraph in points */
    spaceAfter?: number;
};

/** Run properties - links are rendered as plain styled text (slide hyperlinks would need a relationship per link) */
function runPropertiesXml(run: InlineRun, options: ParagraphOptions): string {
    const bold = run.bold || options.bold ? ' b="1"' : '';
    const italic = run.italic || options.italic ? ' i="1"' : '';
    const strike = run.strike ? ' strike="sngStrike"' : '';
    const alpha = options.transparency ? `<a:alpha val="${Math.round((100 - options.transparency) * 1000)}"/>` : '';
    const font = run.code ? 'Consolas' : options.font;
    const size = run.code ? Math.round(options.size * 0.9) : options.size;
    return `<a:rPr lang="en-US" sz="${pt(size)}"${bold}${italic}${strike} dirty="0"><a:solidFill><a:srgbClr val="${options.color}">${alpha}</a:srgbClr></a:solidFill><a:latin typeface="${escapeXml(font)}"/></a:rPr>`;
}

/** One `<a:p>` from styled runs. Newlines inside runs become line breaks. */
function paragraphXml(runs: InlineRun[], options: ParagraphOptions): string {
    const pPr: string[] = [];
    const attrs: string[] = [];
    if (options.align) attrs.push(`algn="${options.align}"`);
    if (options.bullet) attrs.push('marL="285750" indent="-285750"');
    if (options.spaceAfter) pPr.push(`<a:spcAft><a:spcPts val="${pt(options.spaceAfter)}"/></a:spcAft>`);
    if (options.bullet) pPr.push(`<a:buClr><a:srgbClr val="${options.bullet.color}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${escapeXml(options.bullet.char)}"/>`);
    else pPr.push('<a:buNone/>');
    const pPrXml = `<a:pPr${attrs.length ? ' ' + attrs.join(' ') : ''}>${pPr.join('')}</a:pPr>`;

    let body = '';
    for (const run of runs) {
        const lines = run.text.split('\n');
        lines.forEach((line, index) => {
            if (index > 0) body += `<a:br>${runPropertiesXml(run, options)}</a:br>`;
            if (line.length) body += `<a:r>${runPropertiesXml(run, options)}<a:t>${escapeXml(line)}</a:t></a:r>`;
        });
    }
    if (!body) body = `<a:endParaRPr lang="en-US" sz="${pt(options.size)}"/>`;
    return `<a:p>${pPrXml}${body}</a:p>`;
}

// -----------------------------------------------------------------------------
// Slide renderers - geometry mirrors the desktop plugin
// -----------------------------------------------------------------------------

function addBranding(slide: SlideBuilder, backgroundColor: string) {
    const dark = isDarkColor(backgroundColor);
    slide.text('Created with', { x: 7.85, y: 5.06, w: 1.85, h: 0.12, size: 5.5, color: dark ? 'FFFFFF' : '000000', font: 'Calibri', italic: true, align: 'ctr', transparency: 78 });
    slide.image({ relId: dark ? LOGO_LIGHT_REL_ID : LOGO_DARK_REL_ID, x: 8.025, y: 5.17, w: 1.5, h: 1.5 * (dark ? LOGO_ASPECT.light : LOGO_ASPECT.dark), transparency: 78 });
}

function addSlideFooter(slide: SlideBuilder, theme: PptxTheme, slideNumber: number, totalSlides: number) {
    slide.rect({ x: MARGIN_X, y: 5.0, w: CONTENT_W, h: 0.007, color: theme.footerLineColor });
    slide.text(`${slideNumber}  /  ${totalSlides}`, { x: MARGIN_X, y: 5.07, w: 1.2, h: 0.25, size: 8, color: theme.footerColor, font: theme.fontBody, align: 'l' });
}

function addAccentUnderline(slide: SlideBuilder, x: number, y: number, color: string) {
    slide.rect({ x, y, w: 1.5, h: 0.035, color });
}

function renderTitleSlide({ title, author }: { title: string; author: string }, theme: PptxTheme): string {
    const slide = new SlideBuilder(theme.titleSlideBackground);
    slide.text(title, { x: 1.0, y: 1.3, w: 8.0, h: 1.4, size: 36, bold: true, color: theme.titleSlideTitleColor, font: theme.fontTitle, align: 'ctr', valign: 'b' });
    addAccentUnderline(slide, 4.25, 2.9, theme.titleSlideAccentColor);
    if (author) slide.text(author, { x: 1.5, y: 3.15, w: 7.0, h: 0.45, size: 14, color: theme.titleSlideSubtitleColor, font: theme.fontBody, align: 'ctr', italic: true });
    slide.rect({ x: 0, y: SLIDE.height - 0.1, w: SLIDE.width, h: 0.1, color: theme.titleSlideAccentColor });
    addBranding(slide, theme.titleSlideBackground);
    return slide.xml();
}

function renderSectionSlide(data: PptxSlide, theme: PptxTheme, slideNumber: number, totalSlides: number): string {
    const slide = new SlideBuilder(theme.titleSlideBackground);
    slide.text(data.title ?? '', { x: 1.0, y: 1.5, w: 8.0, h: 1.2, size: 32, bold: true, color: theme.titleSlideTitleColor, font: theme.fontTitle, align: 'ctr', valign: 'b' });
    addAccentUnderline(slide, 4.25, 2.9, theme.titleSlideAccentColor);
    if (data.subtitle) slide.text(data.subtitle, { x: 1.5, y: 3.1, w: 7.0, h: 0.5, size: 16, color: theme.titleSlideSubtitleColor, font: theme.fontBody, align: 'ctr' });
    const numberColor = isDarkColor(theme.titleSlideBackground) ? 'FFFFFF' : '000000';
    slide.text(`${slideNumber}  /  ${totalSlides}`, { x: MARGIN_X, y: 5.1, w: 1.2, h: 0.25, size: 8, color: numberColor, font: theme.fontBody, align: 'l', transparency: 65 });
    addBranding(slide, theme.titleSlideBackground);
    return slide.xml();
}

function renderContentSlide(data: PptxSlide, theme: PptxTheme, slideNumber: number, totalSlides: number): string {
    const slide = new SlideBuilder(theme.background);
    slide.rect({ x: 0, y: 0, w: SLIDE.width, h: 0.05, color: theme.accentColor });

    let contentStartY = 0.4;
    if (data.title) {
        slide.text(data.title, { x: MARGIN_X, y: 0.3, w: CONTENT_W, h: 0.65, size: 24, bold: true, color: theme.titleColor, font: theme.fontTitle, valign: 'b' });
        contentStartY = 1.0;
        if (data.subtitle) {
            slide.text(data.subtitle, { x: MARGIN_X, y: 1.0, w: CONTENT_W, h: 0.3, size: 13, color: theme.subtitleColor, font: theme.fontBody });
            contentStartY = 1.35;
        }
        addAccentUnderline(slide, MARGIN_X, contentStartY + 0.05, theme.accentColor);
        contentStartY += 0.25;
    }

    const footerY = 5.0;
    const contentHeight = footerY - contentStartY - 0.15;

    if (data.table && (data.table.headers?.length || data.table.rows?.length)) {
        slide.table(data.table, theme, { x: MARGIN_X, y: contentStartY, w: CONTENT_W });
    } else if (Array.isArray(data.content) && data.content.length) {
        const bullets = data.content
            .map(point => String(point ?? '').trim())
            .filter(Boolean)
            .map(point => paragraphXml(inlineMarkdownToRuns(point), {
                size: 15,
                color: theme.bodyColor,
                font: theme.fontBody,
                bullet: { char: '▪', color: theme.bulletColor },
                spaceAfter: 10,
            }));
        if (bullets.length) slide.paragraphs(bullets, { x: MARGIN_X, y: contentStartY, w: CONTENT_W, h: contentHeight, valign: 't' });
    }

    addSlideFooter(slide, theme, slideNumber, totalSlides);
    addBranding(slide, theme.background);
    return slide.xml();
}

function renderBlankSlide(theme: PptxTheme, slideNumber: number, totalSlides: number): string {
    const slide = new SlideBuilder(theme.background);
    addSlideFooter(slide, theme, slideNumber, totalSlides);
    addBranding(slide, theme.background);
    return slide.xml();
}

// -----------------------------------------------------------------------------
// Presentation-level parts
// -----------------------------------------------------------------------------

function presentationXml(slideCount: number): string {
    const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="${slideRelId(index)}"/>`).join('');
    const levels = Array.from({ length: 9 }, (_, index) =>
        `<a:lvl${index + 1}pPr marL="${index * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${index + 1}pPr>`,
    ).join('');
    return `${XML_DECLARATION}<p:presentation ${P_NS} saveSubsetFonts="1" autoCompressPictures="0">` +
        `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
        `<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>` +
        `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
        `<p:sldSz cx="${emu(SLIDE.width)}" cy="${emu(SLIDE.height)}"/><p:notesSz cx="6858000" cy="9144000"/>` +
        `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${levels}</p:defaultTextStyle></p:presentation>`;
}

const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

const EMPTY_SP_TREE_HEAD = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function textStyleLevels(size: number): string {
    return Array.from({ length: 9 }, (_, index) =>
        `<a:lvl${index + 1}pPr marL="${index * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${index + 1}pPr>`,
    ).join('');
}

function slideMasterXml(theme: PptxTheme): string {
    return `${XML_DECLARATION}<p:sldMaster ${P_NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${EMPTY_SP_TREE_HEAD}</p:spTree></p:cSld>${CLR_MAP}` +
        `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
        `<p:txStyles><p:titleStyle>${textStyleLevels(4400)}</p:titleStyle><p:bodyStyle>${textStyleLevels(1800)}</p:bodyStyle><p:otherStyle>${textStyleLevels(1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function slideLayoutXml(): string {
    return `${XML_DECLARATION}<p:sldLayout ${P_NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_SP_TREE_HEAD}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMasterXml(): string {
    return `${XML_DECLARATION}<p:notesMaster ${P_NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_SP_TREE_HEAD}` +
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="1143000" y="685800"/><a:ext cx="4572000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>` +
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp>` +
        `</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle>${textStyleLevels(1200)}</p:notesStyle></p:notesMaster>`;
}

function notesSlideXml(notes: string): string {
    const paragraphs = notes.split(/\r?\n/).map(line => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`).join('');
    return `${XML_DECLARATION}<p:notes ${P_NS}><p:cSld><p:spTree>${EMPTY_SP_TREE_HEAD}` +
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>` +
        `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

function themeXml(name: string, theme: PptxTheme): string {
    const font = (typeface: string) => `<a:latin typeface="${escapeXml(typeface)}"/><a:ea typeface=""/><a:cs typeface=""/>`;
    return `${XML_DECLARATION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${escapeXml(name)}"><a:themeElements>` +
        `<a:clrScheme name="AnythingLLM"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${theme.titleColor}"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>` +
        `<a:accent1><a:srgbClr val="${theme.accentColor}"/></a:accent1><a:accent2><a:srgbClr val="${theme.bulletColor}"/></a:accent2><a:accent3><a:srgbClr val="${theme.titleSlideAccentColor}"/></a:accent3><a:accent4><a:srgbClr val="${theme.subtitleColor}"/></a:accent4><a:accent5><a:srgbClr val="${theme.footerColor}"/></a:accent5><a:accent6><a:srgbClr val="${theme.tableHeaderBg}"/></a:accent6>` +
        `<a:hlink><a:srgbClr val="${theme.accentColor}"/></a:hlink><a:folHlink><a:srgbClr val="${theme.subtitleColor}"/></a:folHlink></a:clrScheme>` +
        `<a:fontScheme name="AnythingLLM"><a:majorFont>${font(theme.fontTitle)}</a:majorFont><a:minorFont>${font(theme.fontBody)}</a:minorFont></a:fontScheme>` +
        `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
        `<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>` +
        `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
        `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
        `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}
