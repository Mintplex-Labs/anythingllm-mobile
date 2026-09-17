/**
 * Word document presets - mirrors `create-files/docx/utils.js` (DOCUMENT_STYLES) on desktop
 * so a document asked for with the same theme looks the same on every platform.
 */

export type DocxThemeName = 'neutral' | 'blue' | 'warm';
export type DocxMarginName = 'normal' | 'narrow' | 'wide';

export type DocxTheme = {
    /** Hex without hash */
    heading: string;
    accent: string;
    tableHeader: string;
    border: string;
    coverBg: string;
    coverText: string;
    footerText: string;
};

export const DOCX_THEMES: Record<DocxThemeName, DocxTheme> = {
    neutral: { heading: '2E4057', accent: '048A81', tableHeader: 'E7E6E6', border: 'CCCCCC', coverBg: '2E4057', coverText: 'FFFFFF', footerText: '666666' },
    blue: { heading: '1B3A6B', accent: '2E86AB', tableHeader: 'D6E8F5', border: 'A8C8E8', coverBg: '1B3A6B', coverText: 'FFFFFF', footerText: '2E86AB' },
    warm: { heading: '5C3317', accent: 'C1440E', tableHeader: 'F5ECD7', border: 'D4B896', coverBg: '5C3317', coverText: 'FFFFFF', footerText: '8B6914' },
};

/** Page margins in twips (1/1440 in) */
export type DocxMargins = { top: number; bottom: number; left: number; right: number };

export const DOCX_MARGINS: Record<DocxMarginName, DocxMargins> = {
    normal: { top: 1440, bottom: 1440, left: 1800, right: 1800 },
    narrow: { top: 720, bottom: 720, left: 720, right: 720 },
    wide: { top: 1440, bottom: 1440, left: 2880, right: 2880 },
};

export const DOCX_FONTS = {
    body: 'Calibri',
    heading: 'Calibri',
    mono: 'Consolas',
} as const;

export const DOCX_THEME_NAMES = Object.keys(DOCX_THEMES) as DocxThemeName[];
export const DOCX_MARGIN_NAMES = Object.keys(DOCX_MARGINS) as DocxMarginName[];

export function getDocxTheme(name?: string | null): DocxTheme {
    const key = String(name ?? 'neutral').toLowerCase().trim() as DocxThemeName;
    return DOCX_THEMES[key] ?? DOCX_THEMES.neutral;
}

export function getDocxMargins(name?: string | null): DocxMargins {
    const key = String(name ?? 'normal').toLowerCase().trim() as DocxMarginName;
    return DOCX_MARGINS[key] ?? DOCX_MARGINS.normal;
}
