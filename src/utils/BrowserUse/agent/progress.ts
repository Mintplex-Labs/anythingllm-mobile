import { DRIFT_CHECK, DRIFT_LIMIT, LOOP_REPEATS, STALL_LIMIT, STALL_WARN } from '../constants';
import { type ActionResult } from '../types';
import { hostOf } from '../urls';
import { idTokensIn } from './guards';
import { type ToolCall } from './types';

/**
 * Is the agent getting anywhere? Tracks what each step showed it, and turns that into warnings for
 * the model and, when it keeps going nowhere, a reason to give up:
 *  - stall: steps in a row that showed nothing new,
 *  - drift: steps whose new content has nothing to do with the task (wandering a site's menus),
 *  - loops: the same 1-3 actions over and over.
 * Purely lexical - no extra model calls.
 */

// Words that say nothing about what a page is about.
const TASK_STOPWORDS = new Set(
    'the and for with from that this what which when where find show tell list give get compare check look search price prices cost about into onto over under than then there their them they you your mine have has had are was were will would could should can on in of to a an is my me our its including any options current special store stores site website online all some more most best'.split(' '),
);

// Repeating these is fine while they keep showing new things (scrolling a long list). Other actions
// must show something related to the task - pages that lazy-load keep changing anyway.
const BROWSING_ACTIONS = new Set(['scroll', 'read_page', 'wait']);

/** Task words worth matching on pages, cut to a 6-letter stem so "refurbished" matches "Refurb". */
export function taskTerms(task = '') {
    const words = String(task).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu) || [];
    return [
        ...new Set(
            words
                .map((word) => word.replace(/[.-]+$/, ''))
                .filter((word) => word.length >= 3 && !TASK_STOPWORDS.has(word) && !/^[\d.,-]+$/.test(word))
                .map((word) => (word.length > 7 ? word.slice(0, 6) : word)),
        ),
    ];
}

export default class ProgressTracker {
    /** Ids seen on pages, in the task or in URLs - a navigate may only use these (see guards.madeUpId) */
    readonly seenIds: Set<string>;
    private readonly terms: string[];
    private seenLines = new Set<string>();
    private seenUrls = new Set<string>();
    private stalled = 0;
    private stallWarned = false;
    private drifted = 0;
    private loopWarnings = 0;

    /** `known` is other text whose ids the agent may use (the start URL, an earlier session's pages). */
    constructor(task: string, known = '') {
        this.terms = taskTerms(task);
        this.seenIds = new Set(idTokensIn(`${task} ${known}`));
    }

    /** Steps in a row whose new content had nothing to do with the task */
    get drift() {
        return this.drifted;
    }

    /** Enough signs of being stuck that a progress check may end the session */
    get struggling() {
        return this.drifted >= DRIFT_CHECK || this.stalled >= STALL_WARN;
    }

    /** Task words that count on this site - the site's own name ("Micro Center" on microcenter.com) is on every page. */
    termsFor(host: string | null) {
        const compact = String(host || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return this.terms.filter((term) => !compact.includes(term));
    }

    /**
     * What a step showed the agent that it had not seen this session. `fresh`: a new URL or new page
     * lines (element ids and digits are ignored, so re-numbering, counters and scroll offsets do not
     * count). `relevant`: one of those new lines mentions the task - new pages that have nothing to
     * do with the task are drift, not progress. A failed action never counts, but what it showed is
     * still remembered.
     */
    observe(result: Partial<ActionResult> | null) {
        let fresh = false;
        let relevant = false;
        const url = result?.page?.url;
        if (url && !this.seenUrls.has(url)) {
            this.seenUrls.add(url);
            fresh = true;
        }
        const state = String(result?.state || '');
        for (const idToken of [...idTokensIn(state), ...idTokensIn(url)]) this.seenIds.add(idToken);
        const terms = this.termsFor(hostOf(url));
        for (const line of state.split('\n')) {
            const key = line
                .replace(/^\s*\[T?\d+\]/, '')
                .replace(/\d+/g, '#')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            if (key.length < 3 || this.seenLines.has(key)) continue;
            this.seenLines.add(key);
            fresh = true;
            if (!relevant && /^\s*\[T?\d+\]/.test(line)) relevant = terms.some((term) => key.includes(term));
        }
        if (result?.ok === false) return { fresh: false, relevant: false };
        return { fresh, relevant };
    }

    /**
     * Counts one executed step. `calls` is the agent's history with this step's call last.
     * Returns text to add to the step's result for the model, and a reason to give up, if any.
     */
    account({ calls, progressed, relevant }: { calls: ToolCall[]; progressed: boolean; relevant: boolean }) {
        const call = calls[calls.length - 1];
        let warning = '';
        let giveUp: string | null = null;

        const moved = BROWSING_ACTIONS.has(call.name) ? progressed : relevant;
        const loop = moved ? null : loopOf(calls);
        if (loop && this.loopWarnings++ === 0)
            warning += `\n\nSTOP: you are repeating the same actions in a loop (${loop}) and it is not working. Try a completely different approach - a different element, a direct URL, or a keyboard key. If you are stuck, call ask_user.`;
        // Still looping after being told to stop: give up instead of burning steps.
        else if (loop && this.loopWarnings > 1)
            giveUp = `I kept repeating the same actions (${loop}) without getting anywhere`;

        if (relevant && !loop) this.drifted = 0;
        else if (++this.drifted >= DRIFT_LIMIT)
            giveUp ??= `the last ${this.drifted} steps found nothing related to the task`;

        if (progressed) this.resetStall({ drift: false });
        else if (++this.stalled >= STALL_LIMIT)
            giveUp ??= `I made no progress in the last ${this.stalled} steps`;
        else if (this.stalled >= STALL_WARN && !this.stallWarned) {
            this.stallWarned = true;
            warning += `\n\nWARNING: your last ${this.stalled} actions showed nothing new - you are not making progress. Try a completely different approach (a direct URL, a different element, the site's search). If the site will not cooperate, call done with success=false and explain what is in the way. After ${STALL_LIMIT - this.stalled} more steps without progress this session ends.`;
        }
        return { warning, giveUp };
    }

    /** A refused action is a step that went nowhere. */
    refused() {
        this.stalled++;
        this.drifted++;
    }

    /** drift: false when the step only showed new (maybe unrelated) content */
    resetStall({ drift = true }: { drift?: boolean } = {}) {
        this.stalled = 0;
        this.stallWarned = false;
        if (!drift) return;
        // Lazy-loading noise must not wipe a loop warning - only real help or going back does.
        this.drifted = 0;
        this.loopWarnings = 0;
    }

    /** The agent knows what it still needs - it is not wandering. */
    clearDrift() {
        this.drifted = 0;
    }
}

/** The 1-3 actions the agent keeps cycling through (click "Post" -> type -> click "Post"...), e.g. "click -> type". */
function loopOf(calls: ToolCall[]): string | null {
    const signature = (c: ToolCall) => {
        // A changing note does not make a repeated action new, nor does a renumbered id for the same element.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { note: _note, id: elementId, ...rest } = c.args || {};
        return `${c.name}:${c.target || elementId}:${JSON.stringify(rest)}`;
    };
    const history = calls.map(signature);
    for (let size = 1; size <= 3; size++) {
        const span = size * LOOP_REPEATS;
        if (history.length < span) break;
        const tail = history.slice(-span);
        if (tail.every((s, i) => s === tail[i % size]))
            return calls
                .slice(-size)
                .map((c) => c.name)
                .join(' -> ');
    }
    return null;
}
