import { type PptxSlide, type PptxSlideLayout } from "@/utils/documents/pptx";
import { safeJsonParse } from "@/utils/formatters";

/**
 * Builds the slides for one presentation section with a focused LLM call - the mobile
 * counterpart of the desktop `create-files/pptx/section-agent.js` sub-agent.
 *
 * Desktop spawns a child agent with web tools that submits slides through a tool call. Here
 * the section builder is a single structured-output completion: it gets the section outline
 * the parent model wrote and answers with JSON slides. No research tools, no streaming - which
 * keeps every section to one round-trip. Anything unparseable falls back to slides built from
 * the key points so a flaky model never sinks the whole deck.
 */

export type PresentationSection = {
    title: string;
    keyPoints?: string[];
    instructions?: string;
};

const LAYOUTS: PptxSlideLayout[] = ['section', 'content', 'blank'];
const MAX_SLIDES_PER_SECTION = 5;
const MAX_BULLETS_PER_SLIDE = 6;

const SECTION_BUILDER_PROMPT = `You are a focused presentation section builder. Your ONLY task is to create detailed slides for ONE section of a PowerPoint presentation.

RULES:
- Create 2-${MAX_SLIDES_PER_SECTION} slides for this section (no more)
- Each content slide should have 3-${MAX_BULLETS_PER_SLIDE} concise bullet points
- Be specific and data-driven when possible, using what you already know
- Include speaker notes with key talking points
- Do NOT add a title slide for the whole presentation - only section content
- Respond with JSON ONLY - no prose, no markdown code fences

Respond with exactly this shape:
{"slides":[{"layout":"section","title":"...","subtitle":"...","notes":"..."},{"layout":"content","title":"...","content":["point","point"],"notes":"..."}]}

Available slide layouts:
- "section": Divider slide with title + optional subtitle
- "content": Bullet points with title + content array + optional notes
  - May include "table": {"headers":["Col1","Col2"],"rows":[["a","b"]]} instead of content
- "blank": Empty slide`;

export function buildSectionPrompt({ section, presentationTitle }: { section: PresentationSection; presentationTitle: string }): string {
    const parts = [`Build slides for this section of the presentation "${presentationTitle}":`, `\nSection Title: ${section.title}`];
    if (section.keyPoints?.length) parts.push(`\nKey Points to Cover:\n${section.keyPoints.map(point => `- ${point}`).join('\n')}`);
    if (section.instructions) parts.push(`\nSpecial Instructions: ${section.instructions}`);
    parts.push(`\nCreate 2-${MAX_SLIDES_PER_SECTION} detailed slides and respond with the JSON object only.`);
    return parts.join('\n');
}

/** Slides straight from the outline - used when the model's answer cannot be used */
export function buildFallbackSlides(section: PresentationSection): PptxSlide[] {
    const slides: PptxSlide[] = [{ layout: 'section', title: section.title, subtitle: '' }];
    if (section.keyPoints?.length) {
        slides.push({ layout: 'content', title: section.title, content: section.keyPoints.slice(0, MAX_BULLETS_PER_SLIDE), notes: `Key points for ${section.title}` });
    }
    return slides;
}

/** Pull the JSON object out of a reply that may be wrapped in code fences or chatter */
export function extractSlidesJson(text: string): { slides?: unknown } | null {
    if (!text) return null;
    const unfenced = text.replace(/```(?:json)?/gi, '').trim();
    const direct = safeJsonParse(unfenced, null);
    if (direct && typeof direct === 'object') return direct;
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const sliced = safeJsonParse(unfenced.slice(start, end + 1), null);
    return sliced && typeof sliced === 'object' ? sliced : null;
}

const asString = (value: unknown) => (value === null || value === undefined ? '' : String(value)).trim();

/** Coerce whatever the model returned into well-formed slides - drops anything unusable */
export function normalizeSlides(raw: unknown): PptxSlide[] {
    if (!Array.isArray(raw)) return [];
    const slides: PptxSlide[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const candidate = item as Record<string, unknown>;
        const layout = LAYOUTS.includes(candidate.layout as PptxSlideLayout) ? (candidate.layout as PptxSlideLayout) : 'content';
        const title = asString(candidate.title);
        const slide: PptxSlide = { layout, title };
        const subtitle = asString(candidate.subtitle);
        if (subtitle) slide.subtitle = subtitle;
        const notes = asString(candidate.notes);
        if (notes) slide.notes = notes;

        if (Array.isArray(candidate.content)) {
            slide.content = candidate.content.map(asString).filter(Boolean).slice(0, MAX_BULLETS_PER_SLIDE);
        }
        const table = candidate.table as Record<string, unknown> | undefined;
        if (table && typeof table === 'object') {
            const headers = Array.isArray(table.headers) ? table.headers.map(asString) : [];
            const rows = Array.isArray(table.rows) ? table.rows.filter(Array.isArray).map(row => (row as unknown[]).map(asString)) : [];
            if (headers.length || rows.length) slide.table = { headers, rows };
        }

        if (layout === 'content' && !slide.content?.length && !slide.table && !title) continue;
        slides.push(slide);
        if (slides.length >= MAX_SLIDES_PER_SECTION) break;
    }
    return slides;
}

/**
 * One section -> its slides.
 * @returns the slides plus whether the model's answer was used or the outline fallback
 */
export async function buildSectionSlides({
    llmProvider,
    section,
    presentationTitle,
}: {
    llmProvider: { runBasicChatCompletion: (messages: any[]) => Promise<{ textResponse: string }> };
    section: PresentationSection;
    presentationTitle: string;
}): Promise<{ slides: PptxSlide[]; usedFallback: boolean }> {
    try {
        const response = await llmProvider.runBasicChatCompletion([
            { role: 'system', content: SECTION_BUILDER_PROMPT },
            { role: 'user', content: buildSectionPrompt({ section, presentationTitle }) },
        ]);
        const text = (response?.textResponse ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
        const slides = normalizeSlides(extractSlidesJson(text)?.slides);
        if (!slides.length) return { slides: buildFallbackSlides(section), usedFallback: true };
        return { slides, usedFallback: false };
    } catch (error) {
        console.error(`[SectionBuilder] Error in section "${section.title}":`, error);
        return { slides: buildFallbackSlides(section), usedFallback: true };
    }
}
