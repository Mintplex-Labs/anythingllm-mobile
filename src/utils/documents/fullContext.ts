/**
 * "Full context" documents.
 *
 * How an attached file reaches the model depends on the provider selected when it was attached:
 *  - On-device (`native`): the text is chunked, embedded and retrieved per prompt (RAG). Small models
 *    run a 1-2k token window, so only the relevant chunks can ever fit.
 *  - External providers (OpenAI, Anthropic, Ollama, ...): nothing is embedded. The whole document is
 *    rendered into the system prompt on every turn (see `BaseOpenAILikeProvider.buildPrompt`), which
 *    is both more accurate than retrieval and cache friendly since the block is stable across turns.
 *
 * A document is "full context" when its record has no vector ids (see `Document.isFullContext`).
 */

/** Above this estimate the user is warned before a document is attached in full. */
export const LARGE_DOCUMENT_TOKEN_WARNING = 16_000;

/** Rough English prose ratio - good enough for a warning, and instant on a phone unlike real tokenizing. */
const CHARS_PER_TOKEN = 4;

export type FullContextDocument = {
    uuid: string;
    name: string;
    content: string;
};

/** Cheap token estimate for a block of text. */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** `1200` -> "1k", `16400` -> "16k", `2_300_000` -> "2.3M" */
export function formatTokenEstimate(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
    return String(tokens);
}

/** True when a document of this size should prompt the user before being sent in full. */
export function isLargeDocument(text: string): boolean {
    return estimateTokens(text) > LARGE_DOCUMENT_TOKEN_WARNING;
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render full context documents for the system prompt. Each document is wrapped in a named tag so the
 * model can tell them apart and cite them by name. Returns null when there is nothing to send.
 */
export function formatDocumentsBlock(documents: FullContextDocument[]): string | null {
    const usable = documents.filter((doc) => !!doc.content?.trim());
    if (!usable.length) return null;
    const rendered = usable
        .map((doc) => `<document name="${escapeAttribute(doc.name)}">\n${doc.content.trim()}\n</document>`)
        .join('\n\n');
    return [
        'The user attached the following documents to this workspace. Their full contents are included below - use them to answer the user\'s questions and refer to them by name when relevant.',
        rendered,
    ].join('\n\n');
}
