import i18n from '@/i18n';
import { clip } from '../text';
import { sitesOf, type BrowserTrace, type BrowserTraceStep } from '../traces';
import { type Blocker } from '../types';
import { sentStatus } from '../session/network';
import { type EarlierTask } from './types';

/**
 * What the browser agent's model reads: the system prompt, the task briefing at the top of every
 * turn, and the result handed back to the chat model. The progress check and final-answer prompts
 * are in ./reflection.ts.
 */

export function systemPrompt({ maxSteps, screenshots = 0 }: { maxSteps: number; screenshots?: number }) {
    return `You are a browser agent. You control a real web browser on the user's phone to complete ONE task for the user, then call done.

After every action you get the current page state:
- [n] lines are interactive elements. Use n with click, type and select_option.
- [Tn] lines are text on the page. Use read_page to read long text in full.
Only the latest page state is shown and ids change after every action, so always use ids from the latest state.
The browser has a phone-sized screen, so sites may show their mobile layout (menus behind a button, fewer columns).

Rules:
- One action at a time. Use as few steps as possible. Navigate straight to a URL when you can, e.g. https://www.google.com/search?q=your+query
- If a cookie banner or popup is in the way, dismiss it.
- Do not buy, book, pay, send messages, post, or submit anything with real-world effects unless the task explicitly asks for it. When in doubt, ask_user first.
- Do not invent search values the task did not give you (like a departure city). Leave optional fields empty, or ask_user if one is required.
- If you need a decision only the user can make, call ask_user.
- Never make up information. Only report what you saw on pages.
- Pages you leave disappear from view. When you see something you need for the answer (a price, a name, a link), save it in the note field of your next action. Your notes are always shown.
- Check your work. If an action's result says "Failed" or "nothing on the page changed", it did not happen - try another way. Before saying something was posted, sent, saved or submitted, confirm it in the page state.
- Results tell you what the page sent to the site ("Sent to the site: ... -> 200 OK"). After you submit something, that line means it went through - NEVER post or send it again; call done. "Nothing was sent to the site" or "(failed)" means it did not go through.

Sign-in pages, captchas and verification codes are a HARD STOP:
- If the content you need is behind a sign-in, a captcha / "are you human" check, or a verification code, call ask_user immediately and do nothing else on that page. Ask the user to handle it themselves in the browser - they will take over, do it, and reply.
- NEVER ask the user to send you a password, username or code in the chat.
- Never guess usernames, passwords or codes. Never try to solve a captcha. Never look for a way around it (other sites, guest links, different URLs, retrying).
- Only type credentials or codes the user gave you for this task.
- A page can show a sign-in form or button and still have the content you need. If the content is there, use it and ignore the form.

Other rules:
- Files cannot be downloaded or uploaded.
- You have at most ${maxSteps} steps.
- When finished, call done with the complete answer: the concrete facts, prices, names and links the user asked for.${screenshots
            ? `\n\nScreenshots: you can call screenshot at most ${screenshots} times. It is a last resort for double-checking, not a way to look around - never use it every step or twice in a row. Use the page state first.`
            : ''
        }

Today is ${new Date().toDateString()}.`;
}

/**
 * The first user message of every turn. `pageState` is passed while there are no steps yet (at the
 * start, and after a context reset) - after that the latest step carries the page.
 */
export function taskBriefing({ task, earlier, progress, notes, visited, plan, pageState }: {
    task: string;
    /** See earlierSummary */
    earlier: string;
    /** What happened before a context reset */
    progress: string[];
    notes: string[];
    /** Page digests (PageDigests.summary) */
    visited: string;
    /** The next step from the latest progress check */
    plan: string | null;
    pageState: string | null;
}) {
    const progressBlock = progress.length ? `\n\nProgress so far:\n${bullets(progress)}` : '';
    const notesBlock = notes.length ? `\n\nYour notes:\n${bullets(notes)}` : '';
    const planBlock = plan ? `\n\nNext step (from your last progress check): ${plan}` : '';
    // The date sits next to the task too - small models otherwise fall back to their training year.
    const briefing = `Task: ${task}\nToday is ${new Date().toDateString()}.${earlier}${progressBlock}${notesBlock}${visited}${planBlock}`;
    if (pageState === null) return briefing;
    return `${briefing}\n\nCurrent page state${progress.length ? ' (the page has changed - read it fresh and only use ids from here)' : ''}:\n${pageState}`;
}

/**
 * What this browser already did earlier in the chat, when this session continues one. The task
 * often only makes sense with it ("now remove it from my cart"). Only the newest earlier task
 * brings its notes - older ones are covered by its summary.
 */
export function earlierSummary(earlier: EarlierTask[], { startUrl, maxSummary = 600 }: { startUrl: string | null; maxSummary?: number }) {
    if (!earlier.length) return '';
    const lines = earlier.map(({ task, status, summary, notes }, i) => {
        const outcome = status === 'done' ? 'Result' : status === 'incomplete' ? 'Partly done' : status === 'stopped' ? 'Stopped by the user' : 'Failed';
        const noted = i === earlier.length - 1 && notes?.length ? `\n  Notes: ${notes.slice(-8).map((n) => clip(n, 160)).join(' | ')}` : '';
        return `- Task: ${clip(task, 200)}\n  ${outcome}: ${summary ? clip(summary, maxSummary) : '(none)'}${noted}`;
    });
    // After the last task the user may have used the browser themselves - the page they left it on
    // is where this session starts, and usually what their request is about.
    const left = earlier.at(-1)?.userPage;
    const where = startUrl
        ? 'opened on the start address'
        : left
            ? `reopened where the user left it after the last task: "${clip(left.title || '', 80)}" (${clip(left.url, 160)}) - the user browsed there themselves, so this page may differ from what the last task saw`
            : 'reopened on the page it ended on';
    return `\n\nThis continues an earlier browser session - the browser was ${where}, with the same sign-ins and cart. Earlier tasks in it:\n${lines.join('\n')}`;
}

/** Everything the page sent to sites this session - ground truth for "was it posted/sent". */
export function sentSummary(steps: BrowserTraceStep[]) {
    const sent = steps.flatMap((step) => (step.sent || []).map((r) => `${step.label}: ${r.method} ${r.label} -> ${sentStatus(r)}`));
    if (!sent.length) return '\n\nData sent to sites: nothing was sent this session.';
    return `\n\nData sent to sites (the site really received these):\n${bullets(sent.slice(-10))}`;
}

/** The agent's notes as a list, for the reflection prompts */
export function notesList(notes: string[]) {
    return bullets(notes) || '(none)';
}

/** What the tool call returns to the chat model, by how the session ended. */
export function resultForParent(trace: BrowserTrace, stopReason: 'user' | 'aborted' | null) {
    const { status, summary, steps } = trace;
    const visited = sitesOf(steps).map((s) => s.host).join(', ') || 'none';
    const last = steps.filter((s) => s.url).at(-1);
    const lastPage = last ? `"${last.title || ''}" (${last.url})` : 'none';
    switch (status) {
        case 'done':
            return `The browser task is complete.\n\nResult:\n${summary}\n\nSites visited: ${visited}`;
        case 'incomplete':
            if (trace.gaveUp)
                return `The browser agent gave up: ${trace.gaveUp}. Do NOT start the browser task again on your own. Tell the user what it found, and suggest they do the step themselves or try a more capable model.\n\nWhat it found:\n${summary}\n\nSites visited: ${visited}`;
            return `The browser agent could not fully complete the task.\n\nWhat it found:\n${summary}\n\nSites visited: ${visited}`;
        case 'stopped':
            return stopReason === 'aborted'
                ? 'The browser session was cancelled.'
                : `The user stopped the browser session before it finished. Steps taken: ${steps.map((s) => s.label).slice(-8).join('; ')}. Last page: ${lastPage}. Do not retry the browser task; ask the user how they want to proceed.`;
        default:
            return `The browser session failed: ${summary}. Let the user know.`;
    }
}

/** What the user is asked when the agent hits a sign-in wall, bot check or verification step. Shown in the chat. */
export function blockerQuestion(kind: Blocker['kind'], site: string) {
    // Literal keys, so the translation tooling sees them.
    const questions: Record<Blocker['kind'], () => string> = {
        login: () => i18n.t('browser_use.blockers.login', { site }),
        captcha: () => i18n.t('browser_use.blockers.captcha', { site }),
        verification: () => i18n.t('browser_use.blockers.verification', { site }),
    };
    return questions[kind]();
}

/** How a resolved blocker is described in the agent's progress notes after a context reset. */
export const BLOCKER_RESOLVED: Record<Blocker['kind'], string> = {
    login: 'signed in',
    captcha: 'completed the human check',
    verification: 'entered the verification code',
};

export const STILL_BLOCKED = "The page is still blocked. Do not try to get past it on your own. If the user's reply gives you what you need (like credentials or a code), use exactly that. Otherwise call ask_user again, or call done and explain.";

export const NUDGE_TOOL_CALL = 'You must reply with a tool call. If the task is complete, call done.';
export const NUDGE_OUT_OF_STEPS = 'You are out of steps. Call done now with everything you found so far.';

function bullets(items: string[]) {
    return items.map((item) => `- ${item}`).join('\n');
}
