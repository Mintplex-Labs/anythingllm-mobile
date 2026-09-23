/**
 * Quick actions for the Quick Actions card - one-tap help for a text selection in any app.
 *
 * The card cannot tell whether the selection sits in an editable field or on a page, so it offers two
 * modes the user switches between:
 *  - Edit: rewrite the selection into text that is copied and pasted straight back over it. Modelled
 *    on the Magic Beacon edit actions in AnythingLLM Desktop (Shorten / Polish). Each prompt insists
 *    on plain text only, so the reply drops into a message or form unchanged.
 *  - Summarize: understand the selection - summarize, explain, pull out the key points or dig deeper.
 * Each mode has only a handful of chips; anything else goes in the free-form input.
 */
export type QuickAction = {
    /** Short label shown on the chip */
    label: string;
    /** The instruction sent ahead of the selected text */
    prompt: () => string;
};

export type QuickMode = 'edit' | 'summarize';

export const QUICK_MODES: { key: QuickMode; label: string }[] = [
    { key: 'edit', label: 'Edit' },
    { key: 'summarize', label: 'Summarize' },
];

const PLAIN_TEXT_ONLY = 'Only return the resulting text - no explanation, no preamble, no quotes and no markdown formatting.';

/** Rewrites for text the user is typing - the result is pasted over the selection. */
export const EDIT_ACTIONS: QuickAction[] = [
    {
        label: 'Polish',
        prompt: () => `Rewrite this text to be clear, grammatically correct and natural while keeping the original meaning, tone and length. ${PLAIN_TEXT_ONLY}`,
    },
    {
        label: 'Shorten',
        prompt: () => `Condense this text to be more concise and direct without losing any important point. ${PLAIN_TEXT_ONLY}`,
    },
    {
        label: 'Fix grammar',
        prompt: () => `Correct the spelling, grammar and punctuation of this text. Change nothing else - keep the wording, tone and formatting as they are. ${PLAIN_TEXT_ONLY}`,
    },
    {
        label: 'More formal',
        prompt: () => `Rewrite this text to be professional and office-appropriate while keeping the same meaning and roughly the same length. ${PLAIN_TEXT_ONLY}`,
    },
];

/** Making sense of text the user is reading - the reply is an answer about the selection, not a rewrite. */
export const SUMMARIZE_ACTIONS: QuickAction[] = [
    {
        label: 'Summarize',
        prompt: () => 'Summarize this text in a few short sentences, keeping only what matters.',
    },
    {
        label: 'Key points',
        prompt: () => 'List the key points of this text as a short bulleted list, one line each.',
    },
    {
        label: 'Explain',
        prompt: () => 'Explain this text in plain, simple language, including any terms or references a reader might not know.',
    },
    {
        label: 'Research',
        prompt: () => 'Research the subject of this text: give the essential background, related facts and anything worth knowing that the text leaves out. Be concise and note where you are unsure.',
    },
];

/** The chips to show for a selection in the given mode. */
export function quickActionsFor(mode: QuickMode): QuickAction[] {
    return mode === 'edit' ? EDIT_ACTIONS : SUMMARIZE_ACTIONS;
}

/** Above this many words a selection reads like something to digest rather than something being typed. */
const LONG_SELECTION_WORDS = 120;
const SHORT_SELECTION_WORDS = 60;
/** "I", "I'm", "my", "we", "let's" ... - someone speaking, which is what a draft looks like. */
const FIRST_PERSON = /\b(i|i'm|i've|i'll|i'd|me|my|mine|we|we're|we've|our|ours|let's)\b/gi;
/** Greetings and sign-offs only appear in messages the user is writing. */
const MESSAGE_MARKERS = /\b(hi|hey|hello|dear|thanks|thank you|cheers|regards|best|sincerely|please let me know|looking forward)\b/i;
/** Reporting language, links, dates and money: published text someone else wrote. */
const PUBLISHED_MARKERS = /\b(said|says|announced|reported|according to|stated|told|spokesperson|press release|inc\.|ltd\.|llc)\b|https?:\/\/|www\.|\b(19|20)\d{2}\b|[$€£]\s?\d/gi;

/**
 * A rough guess at which mode to open in, from the selection alone - the user can always flip it.
 * Text someone is writing themselves (a message, a post, a reply) is usually short, in the first
 * person and addressed to someone; text worth summarizing is longer, about third parties and full of
 * reporting language, links, dates or figures. Ties go to Edit, the flow the toolbar entry is built
 * around. Deliberately simple: a handful of signals, no language model, no attempt at nuance.
 */
export function guessQuickMode(selectedText: string): QuickMode {
    const text = selectedText.trim();
    if (!text) return 'edit';
    const words = text.split(/\s+/).length;
    let score = 0;

    if (words <= SHORT_SELECTION_WORDS) score += 2;
    if (words > LONG_SELECTION_WORDS) score -= 3;
    if (words > LONG_SELECTION_WORDS * 3) score -= 2;
    // Several paragraphs is an article or an email thread, not a sentence being drafted.
    if (/\n\s*\n/.test(text)) score -= 2;

    score += Math.min(3, (text.match(FIRST_PERSON) ?? []).length) * 2;
    if (MESSAGE_MARKERS.test(text)) score += 2;
    score -= Math.min(3, (text.match(PUBLISHED_MARKERS) ?? []).length) * 2;

    return score >= 0 ? 'edit' : 'summarize';
}

/**
 * System prompt of the Quick Actions workspace. Rewrites must stay drop-in ready even for free-form
 * instructions ("make it sound less annoyed") the chips do not cover; questions get a short answer.
 */
export const QUICK_CONTEXT_SYSTEM_PROMPT = [
    'You are an assistant working on a piece of text the user selected on their phone.',
    'When asked to rewrite, edit, translate or otherwise change the text, reply with the resulting text only: no preamble, no explanation, no surrounding quotes and no markdown formatting unless the user asks for it. Preserve the meaning, language and any names, numbers, links or formatting the text already has unless told otherwise.',
    'When asked to summarize, explain, research or answer a question about the text, answer briefly in plain language; short lists are fine where they help.',
].join(' ');

/**
 * The first prompt of a Quick Actions thread: the instruction, then the selection fenced off so the
 * model cannot mistake it for further instructions. Stored on the chat row verbatim, so the thread
 * reads correctly when reopened in the main app.
 */
export function buildQuickContextPrompt(instruction: string, selectedText: string): string {
    const text = selectedText.trim();
    if (!text) return instruction.trim();
    return `${instruction.trim()}\n\nText:\n"""\n${text}\n"""`;
}
