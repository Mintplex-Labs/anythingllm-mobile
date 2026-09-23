import { marked } from 'marked';
import { stripHtml, unescapeHtml } from '@/utils/chat/export/pdf/encoding';

/**
 * Markdown parsing shared by the Office generators. Produces plain unicode runs (the OOXML
 * formats are utf8 so, unlike the PDF renderer, nothing has to be squeezed into WinAnsi).
 */

export type InlineRun = {
    text: string;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    code?: boolean;
    /** Absolute href when the run is part of a link */
    link?: string;
};

export type InlineStyle = Omit<InlineRun, 'text'>;

/** Tokenize a markdown document. Falls back to one paragraph of raw text when the lexer throws. */
export function lexMarkdown(markdown: string): marked.Token[] {
    try {
        return marked.lexer(markdown ?? '', { gfm: true, breaks: true });
    } catch {
        return [{ type: 'paragraph', raw: markdown, text: markdown, tokens: [{ type: 'text', raw: markdown, text: markdown }] } as marked.Token];
    }
}

/** Flatten marked inline tokens into styled runs */
export function inlineTokensToRuns(tokens: marked.Token[] | undefined, style: InlineStyle = {}): InlineRun[] {
    const runs: InlineRun[] = [];
    if (!tokens) return runs;
    for (const token of tokens) {
        switch (token.type) {
            case 'text':
                if ('tokens' in token && token.tokens?.length) runs.push(...inlineTokensToRuns(token.tokens, style));
                else runs.push({ ...style, text: unescapeHtml(token.text) });
                break;
            case 'escape':
                runs.push({ ...style, text: unescapeHtml(token.text) });
                break;
            case 'strong':
                runs.push(...inlineTokensToRuns(token.tokens, { ...style, bold: true }));
                break;
            case 'em':
                runs.push(...inlineTokensToRuns(token.tokens, { ...style, italic: true }));
                break;
            case 'del':
                runs.push(...inlineTokensToRuns(token.tokens, { ...style, strike: true }));
                break;
            case 'codespan':
                runs.push({ ...style, text: unescapeHtml(token.text), code: true });
                break;
            case 'br':
                runs.push({ ...style, text: '\n' });
                break;
            case 'link': {
                const inner = inlineTokensToRuns(token.tokens, { ...style, link: token.href });
                runs.push(...(inner.length ? inner : [{ ...style, text: token.href, link: token.href }]));
                break;
            }
            case 'image':
                runs.push({ ...style, text: token.text ? `[image: ${token.text}]` : '[image]', italic: true });
                break;
            case 'html':
                runs.push({ ...style, text: stripHtml(token.text) });
                break;
            default: {
                const raw = (token as any).text ?? (token as any).raw;
                if (raw) runs.push({ ...style, text: String(raw) });
            }
        }
    }
    return runs;
}

/** Runs for a single line of inline markdown eg: a bullet point that may contain **bold** */
export function inlineMarkdownToRuns(text: string, style: InlineStyle = {}): InlineRun[] {
    try {
        const tokens = marked.lexer(text ?? '', { gfm: true, breaks: true });
        const runs: InlineRun[] = [];
        for (const token of tokens) {
            if ('tokens' in token && token.tokens?.length) runs.push(...inlineTokensToRuns(token.tokens, style));
            else if ('text' in token && token.text) runs.push({ ...style, text: unescapeHtml(String(token.text)) });
        }
        return runs.length ? runs : [{ ...style, text: text ?? '' }];
    } catch {
        return [{ ...style, text: text ?? '' }];
    }
}

/** Plain text of a run list - used for metadata and fallbacks */
export function runsToPlainText(runs: InlineRun[]): string {
    return runs.map(run => run.text).join('');
}

/** First heading in the document, or null - used to pick a title when the model gave none */
export function firstHeading(tokens: marked.Token[]): string | null {
    for (const token of tokens) {
        if (token.type === 'heading') return runsToPlainText(inlineTokensToRuns(token.tokens)).trim() || null;
    }
    return null;
}
