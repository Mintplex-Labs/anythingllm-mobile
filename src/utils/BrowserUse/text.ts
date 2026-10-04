/** One line, at most `max` characters - for labels, notes and anything quoted back to the model. */
export function clip(text: unknown = '', max = 40) {
    const flat = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Drops <think> blocks from reasoning models' replies. */
export function stripThinking(text = '') {
    return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
