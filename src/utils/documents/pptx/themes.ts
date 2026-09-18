/**
 * Presentation themes - mirrors `create-files/pptx/themes.js` on desktop so a deck asked for
 * with the same theme looks the same on every platform. Colours are hex without the hash.
 */

export type PptxThemeName = 'default' | 'corporate' | 'dark' | 'minimal' | 'creative';

export type PptxTheme = {
    name: string;
    description: string;

    titleSlideBackground: string;
    titleSlideTitleColor: string;
    titleSlideSubtitleColor: string;
    titleSlideAccentColor: string;

    background: string;
    titleColor: string;
    subtitleColor: string;
    bodyColor: string;
    accentColor: string;
    bulletColor: string;

    tableHeaderBg: string;
    tableHeaderColor: string;
    tableAltRowBg: string;
    tableBorderColor: string;

    footerColor: string;
    footerLineColor: string;

    fontTitle: string;
    fontBody: string;
};

export const PPTX_THEMES: Record<PptxThemeName, PptxTheme> = {
    default: {
        name: 'Professional',
        description: 'Clean and versatile - works for any presentation',
        titleSlideBackground: '1E293B', titleSlideTitleColor: 'FFFFFF', titleSlideSubtitleColor: '94A3B8', titleSlideAccentColor: '3B82F6',
        background: 'FFFFFF', titleColor: '0F172A', subtitleColor: '64748B', bodyColor: '334155', accentColor: '2563EB', bulletColor: '2563EB',
        tableHeaderBg: '1E293B', tableHeaderColor: 'FFFFFF', tableAltRowBg: 'F8FAFC', tableBorderColor: 'E2E8F0',
        footerColor: '94A3B8', footerLineColor: 'E2E8F0',
        fontTitle: 'Calibri', fontBody: 'Calibri',
    },
    corporate: {
        name: 'Corporate',
        description: 'Refined and authoritative - ideal for business and finance',
        titleSlideBackground: '0C1929', titleSlideTitleColor: 'FFFFFF', titleSlideSubtitleColor: '7B96B5', titleSlideAccentColor: 'C9943E',
        background: 'FFFFFF', titleColor: '0C1929', subtitleColor: '5A6D82', bodyColor: '2C3E50', accentColor: '1A5276', bulletColor: '1A5276',
        tableHeaderBg: '0C1929', tableHeaderColor: 'FFFFFF', tableAltRowBg: 'F4F7FA', tableBorderColor: 'D5DBE2',
        footerColor: '8B9DB3', footerLineColor: 'D5DBE2',
        fontTitle: 'Calibri', fontBody: 'Calibri',
    },
    dark: {
        name: 'Dark',
        description: 'Sleek dark theme - great for tech and product presentations',
        titleSlideBackground: '0F0F1A', titleSlideTitleColor: 'F8FAFC', titleSlideSubtitleColor: '7C8DB5', titleSlideAccentColor: '818CF8',
        background: '18181B', titleColor: 'F4F4F5', subtitleColor: 'A1A1AA', bodyColor: 'D4D4D8', accentColor: '6366F1', bulletColor: '818CF8',
        tableHeaderBg: '6366F1', tableHeaderColor: 'FFFFFF', tableAltRowBg: '1F1F24', tableBorderColor: '3F3F46',
        footerColor: '71717A', footerLineColor: '3F3F46',
        fontTitle: 'Calibri', fontBody: 'Calibri',
    },
    minimal: {
        name: 'Minimal',
        description: 'Ultra-clean with maximum whitespace - lets content speak',
        titleSlideBackground: 'F5F5F5', titleSlideTitleColor: '171717', titleSlideSubtitleColor: '737373', titleSlideAccentColor: 'A3A3A3',
        background: 'FFFFFF', titleColor: '171717', subtitleColor: '737373', bodyColor: '404040', accentColor: '525252', bulletColor: 'A3A3A3',
        tableHeaderBg: '262626', tableHeaderColor: 'FFFFFF', tableAltRowBg: 'FAFAFA', tableBorderColor: 'E5E5E5',
        footerColor: 'A3A3A3', footerLineColor: 'E5E5E5',
        fontTitle: 'Calibri', fontBody: 'Calibri Light',
    },
    creative: {
        name: 'Creative',
        description: 'Bold and expressive - perfect for pitches and creative work',
        titleSlideBackground: '2E1065', titleSlideTitleColor: 'FFFFFF', titleSlideSubtitleColor: 'C4B5FD', titleSlideAccentColor: 'A78BFA',
        background: 'FFFFFF', titleColor: '3B0764', subtitleColor: '7C3AED', bodyColor: '374151', accentColor: '7C3AED', bulletColor: '7C3AED',
        tableHeaderBg: '5B21B6', tableHeaderColor: 'FFFFFF', tableAltRowBg: 'FAF5FF', tableBorderColor: 'E9D5FF',
        footerColor: 'A78BFA', footerLineColor: 'E9D5FF',
        fontTitle: 'Calibri', fontBody: 'Calibri',
    },
};

export const PPTX_THEME_NAMES = Object.keys(PPTX_THEMES) as PptxThemeName[];

export function getPptxTheme(name?: string | null): PptxTheme {
    const key = String(name ?? 'default').toLowerCase().trim() as PptxThemeName;
    return PPTX_THEMES[key] ?? PPTX_THEMES.default;
}
