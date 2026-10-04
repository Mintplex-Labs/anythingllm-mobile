import { DIGEST_LINES, DIGEST_PAGES } from '../constants';
import { clip } from '../text';
import { type ActionResult } from '../types';

/**
 * Page digests: the few lines of each visited page that look relevant to the task, so leaving a
 * page does not erase what was on it. Only the latest page state is in the model's context; these
 * are shown with the task on every turn, and to the progress check and final answer.
 */

type DigestLine = { line: string; score: number; matched: boolean };
export type DigestPage = { url: string; title: string; lines: DigestLine[]; score: number; relevant?: number };

// A price or percentage is often the answer, even on a line without a task word.
const PRICE = /[$€£¥]\s?\d|\d[\d,.]*\s?(usd|eur|gbp|%)\b/i;

export default class PageDigests {
    private pages = new Map<string, DigestPage>();
    /** The page the agent is on */
    currentUrl: string | null = null;

    /**
     * Keep the lines of a page that look relevant to the task: task words (`terms`, without the
     * site's own name), prices and numbers, and the line right after a match (labels are often
     * followed by their value). Kept per page, so the useful page of a site is not replaced by the
     * next one on the same site.
     */
    add(result: Partial<ActionResult>, terms: string[]) {
        const url = String(result?.page?.url || '').split('#')[0];
        if (!/^https?:/i.test(url) || !result.state) return;
        this.currentUrl = url;
        const lines = String(result.state)
            .split('\n')
            .filter((line) => /^\[T?\d+\]/.test(line))
            .map((line) => line.replace(/^\[T?\d+\]\s*/, ''));
        let previousMatched = false;
        const scored = lines.map((line): DigestLine => {
            const lower = line.toLowerCase();
            let score = terms.filter((term) => lower.includes(term)).length;
            const matched = score > 0;
            if (PRICE.test(line)) score += 1.5;
            if (previousMatched) score += 1;
            previousMatched = matched;
            return { line: clip(line, 160), score, matched };
        });
        const page: DigestPage = this.pages.get(url) || { url, title: '', lines: [], score: 0 };
        page.title = clip(result.page?.title || page.title, 60);
        // Scrolling and reading the same page adds to what it already had.
        const merged = new Map(page.lines.map((entry) => [entry.line, entry]));
        for (const entry of scored) if (entry.score >= 1.5 && !merged.has(entry.line)) merged.set(entry.line, entry);
        page.lines = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, DIGEST_LINES);
        page.score = page.lines.reduce((sum, entry) => sum + entry.score, 0);
        page.relevant = page.lines.filter((entry) => entry.matched).length;
        if (!page.lines.length) return;
        this.pages.set(url, page);
        // Over the limit: forget the least useful page, never the current one.
        while (this.pages.size > DIGEST_PAGES) {
            const worst = [...this.pages.values()].filter((p) => p.url !== url).sort((a, b) => a.score - b.score)[0];
            this.pages.delete(worst.url);
        }
    }

    /** The visited page with the most task-related content (prices alone do not count). */
    best(): DigestPage | null {
        let best: DigestPage | null = null;
        for (const page of this.pages.values()) if (page.relevant && (!best || page.score > best.score)) best = page;
        return best;
    }

    /** The "Most useful pages so far" block. The current page is left out unless asked - its full state is already shown. */
    summary({ includeCurrent = false }: { includeCurrent?: boolean } = {}) {
        const pages = [...this.pages.values()]
            .filter((page) => includeCurrent || page.url !== this.currentUrl)
            .sort((a, b) => b.score - a.score);
        if (!pages.length) return '';
        return `\n\nMost useful pages so far (key lines - their ids are no longer valid, but you can navigate back to the URL):\n${pages
            .map(({ url, title, lines }) => `- ${title ? `"${title}" ` : ''}${clip(url, 120)}: ${lines.map((e) => e.line).join(' | ')}`)
            .join('\n')}`;
    }
}
