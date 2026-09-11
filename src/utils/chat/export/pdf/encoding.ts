/**
 * pdf-lib's standard (non-embedded) fonts can only encode WinAnsi characters.
 * Drawing anything outside that set throws, so every string that reaches the
 * page goes through `toWinAnsi` first.
 *
 * Everything non-ASCII in this file is written as a `\u` escape on purpose -
 * invisible characters in source are a trap for editors and shells alike.
 */

/** Characters WinAnsi can represent beyond plain Latin-1 (the 0x80-0x9F block) */
const WIN_ANSI_EXTRAS =
  '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D' +
  '\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';

const UNSUPPORTED = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF${WIN_ANSI_EXTRAS}\\n]`, 'g');

/** Sensible ASCII stand-ins for characters models commonly emit */
const REPLACEMENTS: Record<string, string> = {
  '\u2010': '-', // hyphen
  '\u2011': '-', // non-breaking hyphen
  '\u2012': '-', // figure dash
  '\u2015': '-', // horizontal bar
  '\u2212': '-', // minus sign
  '\u2032': "'", // prime
  '\u2033': '"', // double prime
  '\u2190': '<-',
  '\u2192': '->',
  '\u2194': '<->',
  '\u21D2': '=>',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u2248': '~',
  '\u2713': 'v', // check mark
  '\u2714': 'v', // heavy check mark
  '\u2717': 'x', // ballot x
  '\u2718': 'x', // heavy ballot x
  '\u25CF': '\u2022', // black circle -> bullet
  '\u25E6': '\u2022', // white bullet -> bullet
  '\u2023': '\u2022', // triangular bullet -> bullet
  '\u2043': '-', // hyphen bullet
  '\u2002': ' ', // en space
  '\u2003': ' ', // em space
  '\u2009': ' ', // thin space
  '\u202F': ' ', // narrow no-break space
  '\u3000': ' ', // ideographic space
};

const REPLACEABLE = new RegExp(`[${Object.keys(REPLACEMENTS).join('')}]`, 'g');
/** Zero-width joiners/spaces, line & paragraph separators, BOM, variation selectors */
const ZERO_WIDTH = /[\u200B-\u200F\u2028\u2029\u2060\uFEFF\uFE0E\uFE0F]/g;
/** Surrogate pairs = astral plane characters, which is where emoji live */
const SURROGATE_PAIRS = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

/**
 * Coerce arbitrary unicode into something Helvetica/Courier can draw.
 * - Emoji and other astral characters are dropped (they have no glyph anyway)
 * - Zero-width characters are dropped
 * - Common symbols are swapped for ASCII equivalents
 * - Anything else unsupported becomes `?` so the reader can tell text was lost
 */
export function toWinAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(ZERO_WIDTH, '')
    .replace(SURROGATE_PAIRS, '')
    .replace(REPLACEABLE, match => REPLACEMENTS[match] ?? '?')
    .replace(UNSUPPORTED, '?');
}

/** Last resort when a font still refuses a string - keep printable ASCII only */
export function toAscii(text: string): string {
  return text.replace(/[^\x20-\x7E\n]/g, '?');
}

/** marked HTML-escapes a handful of token types (codespans, escapes) - undo that */
export function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strip tags from raw html so at least the text survives */
export function stripHtml(text: string): string {
  return unescapeHtml(text.replace(/<[^>]*>/g, ''));
}
