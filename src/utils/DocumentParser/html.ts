const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeHtmlEntities(input: string): string {
    return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        const lower = entity.toLowerCase();
        if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
        if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
        return NAMED_ENTITIES[lower] ?? match;
    });
}

/**
 * Reduce an HTML document to readable text. Block-level elements become line breaks so the
 * chunker sees paragraph boundaries; everything inside script/style/head is dropped.
 */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|head|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|table|ul|ol|dd|dt)>/gi, '\n')
        .replace(/<(td|th)\b[^>]*>/gi, '\t')
        .replace(/<[^>]+>/g, '');

    // One block per line, blank lines dropped: source indentation and closing tags otherwise
    // leave runs of empty lines that add nothing for chunking.
    return decodeHtmlEntities(text)
        .split('\n')
        .map(line => line.replace(/[ \t ]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}
