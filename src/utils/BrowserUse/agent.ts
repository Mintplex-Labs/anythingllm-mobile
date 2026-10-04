import { AppState } from 'react-native';
import { generateUUID } from '@/utils/constants';
import { isAbortError } from '@/utils/chat/abort';
import { safeJsonParse } from '@/utils/formatters';
import { type ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import i18n from '@/i18n';
import BrowserSession, { type ActionResult, type Blocker } from './session';
import BrowserTraces, { resumeUrlOf, sitesOf, type BrowserEarlierTask, type BrowserTrace, type BrowserTraceStatus } from './traces';
import {
    BROWSER_TOOLS,
    BROWSER_TOOL_NAMES,
    CONTROL_TOOLS,
    SCREENSHOT_TOOL,
    clip,
    stepLabel,
    systemPrompt,
    toolDefinitions,
    type BrowserToolSchema,
} from './tools';

/**
 * The browser sub-agent - a port of the desktop BrowserAgent
 * (server/utils/agents/aibitat/plugins/browser-use/agent.js). It runs its own tool loop with the
 * user's chat model, driving a WebView through ./session.ts.
 *
 * The heuristics (progress/stall/drift tracking, loop detection, progress checks, the final-answer
 * pass, page digests, placeholder and made-up-URL guards) are unchanged from desktop. Differences:
 *  - the model is always called with native tool calling (every cloud provider here supports it);
 *    a plain-text JSON action is still accepted as a fallback,
 *  - desktop's borrowed skills (filesystem, rag-memory) do not exist on mobile,
 *  - help requests reach the user through the chat card, the take-over viewer and a notification,
 *  - Android freezes the app shortly after it goes to the background, so a session pauses while
 *    the user is in another app and picks up when they return (see #complete).
 */

/** What the sub-agent needs from the chat provider */
export type BrowserAgentLLM = {
    completeWithTools(messages: any[], tools: ReturnType<typeof toolDefinitions>): Promise<ICompleteResponse>;
};

const MAX_STEPS = 40;
const MAX_NUDGES = 2;
const HELP_TIMEOUT_MS = 15 * 60_000;
// Made-up stand-ins for real values ("YOUR_PASSWORD", "[Your Apple ID]") must never be typed.
const PLACEHOLDER_TEXT = [
    /^\s*[[<{(]\s*(your|enter|insert)\b[^\]>})]*[\]>})]\s*$/i,
    /^\s*(your|enter|insert)[\s_-]+(user ?name|email|e-mail|password|passcode|phone( number)?|apple id|id|code|otp|account)\b/i,
    /^[A-Z0-9]+(_[A-Z0-9]+)*_(USER(NAME)?|EMAIL|PASSWORD|PHONE|CODE|OTP|NAME|ID)\b/,
];
// A cycle of 1-3 actions repeated this many times in a row counts as a loop.
const LOOP_REPEATS = 3;
// Giving up. A step makes progress when it shows the agent something it has not seen this session:
// a new page, new page content or a new note. After STALL_WARN steps in a row without progress the
// agent is warned; at STALL_LIMIT the session ends and hands back to the user with what it found.
const STALL_WARN = 5;
const STALL_LIMIT = 8;
// Hard budget for one session (prompt + completion, all calls). Past it the agent wraps up.
const MAX_SESSION_TOKENS = 200_000;
// Drift: new pages keep coming but nothing on them relates to the task (clicking around a site's
// menus). It triggers a progress check (see #checkpoint) and, if it keeps up, ends the session.
const DRIFT_CHECK = 4;
const DRIFT_LIMIT = 12;
// Progress checks: one short call that asks the model, outside the action loop, whether the agent is
// on track. Run when drifting, after leaving the most useful page, and every CHECK_EVERY steps.
const CHECK_EVERY = 10;
const MAX_CHECKPOINTS = 4;
// Ids in a URL path (product 695807, ASIN B0CHX1W1XY) cannot be guessed - see #madeUpUrl.
const ID_TOKEN = /\d{5,}|\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/g;

// Page digests: the few lines of each visited page that look relevant to the task, so leaving a page
// does not erase what was on it. Purely lexical - no extra model calls.
const DIGEST_LINES = 5;
const DIGEST_PAGES = 6;
const DIGEST_STOPWORDS = new Set(
    'the and for with from that this what which when where find show tell list give get compare check look search price prices cost about into onto over under than then there their them they you your mine have has had are was were will would could should can on in of to a an is my me our its including any options current special store stores site website online all some more most best'.split(' '),
);
// `done` goes through one final-answer call (see #finalAnswer). It may send the agent back to work
// this many times - small models love to stop after the first site.
const MAX_DONE_CHECKS = 2;

// Screenshots are a last resort for vision models, not an every-step habit.
const MAX_SCREENSHOTS = 3;
// Trace writes carry every thumbnail - batch them instead of writing after every step.
const TRACE_SAVE_INTERVAL_MS = 3_000;
// Continuing a session: how many earlier tasks of the same browser the agent is told about.
const MAX_EARLIER_TASKS = 3;

/** How a resolved blocker is described in the agent's progress notes after a context reset. */
const BLOCKER_RESOLVED: Record<Blocker['kind'], string> = {
    login: 'signed in',
    captcha: 'completed the human check',
    verification: 'entered the verification code',
};

/** What the user is asked when the agent hits a sign-in wall, bot check or verification step. Shown in the chat. */
const BLOCKER_QUESTIONS: Record<Blocker['kind'], (site: string) => string> = {
    login: (site) => i18n.t('browser_use.blockers.login', { site }),
    captcha: (site) => i18n.t('browser_use.blockers.captcha', { site }),
    verification: (site) => i18n.t('browser_use.blockers.verification', { site }),
};

type ToolCall = { name: string; args: Record<string, any>; raw: { id: string; name: string; arguments: string; extra_content?: any }; target?: string };

type BrowserAgentRecord = {
    call: ToolCall;
    /** Result as shown when it is the latest record */
    full: string;
    /** One-line result once it is older */
    short: string;
    /** Trimmed result kept a little longer (reads, user replies) */
    medium: string | null;
    image?: string | null;
};

type DigestPage = { url: string; title: string; lines: Array<{ line: string; score: number; matched: boolean }>; score: number; relevant?: number };

/** The live state shown in the chat card - persisted with the chat once the session ends. */
export type BrowserSessionSnapshot = {
    sessionId: string;
    task: string;
    profile: string;
    status: BrowserTraceStatus;
    summary: string | null;
    question: string | null;
    tokens: { prompt: number; completion: number; total: number; estimated: boolean };
    stepCount: number;
    step: { label: string; ok: boolean; url: string | null; title: string | null; favicon: string | null } | null;
    recentSteps: Array<{ label: string; ok: boolean; favicon: string | null; url: string | null }>;
    sites: Array<{ host: string; favicon: string | null }>;
    /** The session this one picked up from (missing on sessions saved before this existed) */
    continuedFrom?: string | null;
    startedAt: string;
    endedAt: string | null;
};

/**
 * Picking up where an earlier session of the same chat left off. Only its trace is needed - the
 * profile keeps the cookies and storage, so reopening its last page brings back the sign-ins and
 * cart (single-page app state that lives only in the tab is lost).
 */
export type BrowserAgentResume = {
    /** The earlier session's trace - its profile, last page and results */
    from: BrowserTrace;
};

export default class BrowserAgent {
    readonly id = generateUUID();
    readonly task: string;
    private llm: BrowserAgentLLM;
    private startUrl: string | null;
    private onUpdate: (snapshot: BrowserSessionSnapshot) => void;
    /** Live thumbnail for the chat card - never persisted with the chat */
    onFrame: ((thumbnail: string) => void) | null = null;
    /** The agent is waiting on the user (ask_user / blocker) */
    onNeedsHelp: ((question: string) => void) | null = null;
    session: BrowserSession | null = null;

    private records: BrowserAgentRecord[] = [];
    private initialState = 'The browser is open on a blank page.';
    question: string | null = null;
    private nudges = 0;
    private nudge: string | null = null;
    stopReason: 'user' | 'aborted' | null = null;
    private estimatedTokens = false;
    private pendingReply: ((reply: string | null) => void) | null = null;
    // "host:kind" walls the user already helped with - never pause twice for the same one.
    private acknowledged = new Set<string>();
    // Blocker on the latest page, and notes carried across context resets (see #resetContext).
    private lastBlocker: Blocker | null = null;
    private progress: string[] = [];
    private loopWarnings = 0;
    // Progress tracking for giving up (see #madeProgress).
    private seenLines = new Set<string>();
    private seenUrls = new Set<string>();
    private stall = 0;
    private stallWarned = false;
    private drift = 0;
    private giveUpReason: string | null = null;
    private checkpoints = 0;
    private lastCheckpoint = 0;
    private wentBack = false;
    // One-line plan from the latest progress check - shown next to the task on every turn.
    private plan: string | null = null;
    // Words of the task that make a page line relevant (see #terms).
    private taskTerms: string[];
    // Ids seen on pages, in the task or the start URL - a URL may only use these (see #madeUpUrl).
    private seenIds: Set<string>;
    // Facts the agent saved via the `note` field of its actions - shown on every turn.
    private notes: string[] = [];
    private visited = new Map<string, DigestPage>();
    private currentUrl: string | null = null;
    private doneChecks = 0;
    private lastText = '';
    private resolveStopped!: (value: { stopped: true }) => void;
    private stopped: Promise<{ stopped: true }>;
    private contextLimit: number;
    private maxChars: number;
    private vision: boolean;
    private screenshotsLeft: number;
    private functions: BrowserToolSchema[];
    private trace: BrowserTrace;
    private traceSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private resume: BrowserAgentResume | null;
    /** What this browser already did in earlier sessions of the chat, oldest first */
    private earlier: Array<BrowserEarlierTask & { notes?: string[]; userPage?: BrowserTrace['userPage'] }>;

    constructor({ llm, task, profile, startUrl, workspace, model, contextLimit, vision, onUpdate, resume = null }: {
        llm: BrowserAgentLLM;
        task: string;
        profile: string | null;
        startUrl: string | null;
        workspace: { slug: string; name: string } | null;
        model: string | null;
        /** The model's context window in tokens */
        contextLimit: number;
        /** The model takes image input (screenshots are offered and disabled on the first image error) */
        vision: boolean;
        onUpdate: (snapshot: BrowserSessionSnapshot) => void;
        /** Continue an earlier session instead of starting on a blank page */
        resume?: BrowserAgentResume | null;
    }) {
        this.llm = llm;
        this.task = task;
        this.startUrl = startUrl || null;
        this.onUpdate = onUpdate;
        this.resume = resume;
        this.taskTerms = taskTerms(task);
        const from = resume?.from;
        this.earlier = from
            ? [
                ...(from.earlier || []),
                { id: from.id, task: from.task, status: from.status, summary: from.summary, notes: from.notes, userPage: from.userPage },
            ].slice(-MAX_EARLIER_TASKS)
            : [];
        // Pages of the earlier session are fair game - going back to a product it opened is not a made-up URL.
        const earlierText = from ? `${from.summary || ''} ${from.steps.map((s) => s.url || '').join(' ')} ${from.userPage?.url || ''}` : '';
        this.seenIds = new Set(`${task} ${startUrl || ''} ${earlierText}`.match(ID_TOKEN) || []);
        this.stopped = new Promise((resolve) => (this.resolveStopped = resolve));
        this.contextLimit = contextLimit || 8_000;
        // ~15% of the context window per page state (4 chars/token), bounded for tiny and huge windows.
        // Capped at ~1.5k tokens: on-screen content comes first, and read_page/scroll get the rest.
        this.maxChars = Math.min(Math.max(Math.round(this.contextLimit * 0.6), 3_000), 6_000);
        this.vision = vision;
        this.screenshotsLeft = vision ? MAX_SCREENSHOTS : 0;
        this.functions = [...BROWSER_TOOLS, ...(vision ? [SCREENSHOT_TOOL] : []), ...CONTROL_TOOLS];
        this.trace = {
            id: this.id,
            task,
            // A continued session stays on the earlier session's profile.
            profile: from?.profile || profile || 'Default',
            profileId: from?.profileId ?? null,
            continuedFrom: from?.id ?? null,
            // Stored without notes - the newest task's notes travel in its own trace.
            earlier: this.earlier.map(({ id, task: earlierTask, status, summary }) => ({ id, task: earlierTask, status, summary: summary ? clip(summary, 1_500) : null })),
            notes: [],
            status: 'running',
            summary: null,
            workspace,
            model,
            tokens: { prompt: 0, completion: 0, total: 0 },
            startedAt: new Date().toISOString(),
            endedAt: null,
            steps: [],
        };
    }

    log(text: string, ...args: any[]) {
        console.log(`\x1b[36m[BrowserAgent]\x1b[0m ${text}`, ...args);
    }

    /////////////////////////////
    // Lifecycle
    /////////////////////////////

    /** Run the task to completion. Resolves with the result handed back to the chat model. */
    async run(): Promise<string> {
        try {
            await this.#startBrowser();
            await this.#loop();
        } catch (error: any) {
            if (!this.stopReason) {
                this.log('Session failed:', error?.message);
                this.#finish('failed', error?.message || String(error));
            }
        } finally {
            if (this.stopReason && !this.trace.endedAt) this.#finish('stopped', null);
            await this.session?.close();
            if (this.traceSaveTimer) clearTimeout(this.traceSaveTimer);
            await BrowserTraces.save(this.trace);
            BrowserTraces.prune();
        }
        return this.#resultForParent();
    }

    /** Stop the session. `reason` is "user" (stop button) or "aborted" (the whole chat reply was stopped). */
    stop(reason: 'user' | 'aborted' = 'user') {
        if (this.stopReason) return;
        this.stopReason = reason;
        this.pendingReply?.(null);
        this.resolveStopped({ stopped: true });
    }

    /** The user answered an ask_user request from the chat card (or finished taking over). */
    reply(text?: string | null): boolean {
        if (!this.pendingReply) return false;
        this.pendingReply(String(text || '').trim() || 'I have done it, please continue.');
        return true;
    }

    get isWaitingForUser() {
        return !!this.pendingReply;
    }

    /**
     * Opens the browser. Continuing an earlier session opens its profile again - its cookies and
     * storage carry the sign-ins and cart - on the page it ended on.
     */
    async #startBrowser() {
        this.session = await BrowserSession.create({
            id: this.id,
            profileId: this.trace.profileId,
            profile: this.trace.profile,
            maxChars: this.maxChars,
        });
        this.trace.profile = this.session.profileName;
        this.trace.profileId = this.session.profileId;
        if (this.stopReason) return;

        // Continuing without a start URL picks up where the earlier session ended.
        const reopen = this.resume && !this.startUrl ? resumeUrlOf(this.resume.from) : null;
        const url = this.startUrl || reopen;
        let result: ActionResult | null = null;
        if (url) result = await this.session.run('navigate', { url });
        if (result) {
            this.initialState = result.state;
            this.lastBlocker = result.blocker || null;
            this.#madeProgress(result);
            this.#recordStep(reopen ? 'resume' : 'navigate', { url }, result);
        }
        this.#emit();
        if (result) await this.#pauseForBlocker(result, 0);
    }

    /////////////////////////////
    // The loop
    /////////////////////////////

    async #loop() {
        for (let step = 1; step <= MAX_STEPS; step++) {
            if (this.stopReason) return;
            const call = await this.#nextCall();
            if (this.stopReason) return;

            if (!call) {
                if (this.nudges++ >= MAX_NUDGES)
                    return this.#finish('incomplete', this.lastText || 'The browser agent stopped responding with actions.');
                this.#pushNudge('You must reply with a tool call. If the task is complete, call done.');
                continue;
            }

            if (call.name === 'done') {
                const { success = true, result = '' } = call.args || {};
                const draft = String(result || this.lastText || '');
                const { missing, answer } = await this.#finalAnswer(draft, { canContinue: step < MAX_STEPS - 2 });
                if (this.stopReason) return;
                if (missing) {
                    this.records.push({
                        call,
                        full: `Not finished yet - ${missing}. Keep working on the task, then call done again.\n\n[Step ${step} of ${MAX_STEPS}]`,
                        short: `Tried to finish early - missing: ${clip(missing, 120)}`,
                        medium: null,
                    });
                    continue;
                }
                return this.#finish(success === false || success === 'false' ? 'incomplete' : 'done', answer);
            }
            await this.#execute(call, step);
            if (this.stopReason) return;
            if (this.trace.tokens.total >= MAX_SESSION_TOKENS)
                this.giveUpReason ??= `I used up this session's budget of ${MAX_SESSION_TOKENS / 1000}k tokens`;
            if (this.giveUpReason) return this.#giveUp(this.giveUpReason);
            if (this.#checkpointDue(step) && (await this.#checkpoint(step))) return;
        }

        // Out of steps - give the model one last chance to report what it found.
        this.#pushNudge('You are out of steps. Call done now with everything you found so far.');
        const call = await this.#nextCall(CONTROL_TOOLS.filter((t) => t.name === 'done'));
        const draft = call?.name === 'done' ? call.args?.result : this.lastText;
        const { answer } = await this.#finalAnswer(String(draft || ''), { canContinue: false });
        this.#finish('incomplete', answer || 'The browser agent ran out of steps before finishing.');
    }

    /**
     * One model call that can be cut short by a stop. Resolves null when stopped.
     *
     * The session runs inside the app, which Android freezes a few seconds after the user switches
     * away - a request in flight then usually dies with its connection. When the app went to the
     * background during the call, the call waits for the user to come back and is retried once.
     */
    async #complete(messages: any[], tools: BrowserToolSchema[]): Promise<ICompleteResponse | null> {
        for (let attempt = 0; ; attempt++) {
            let backgrounded = AppState.currentState === 'background';
            const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') backgrounded = true; });
            try {
                const completion = this.llm.completeWithTools(messages, toolDefinitions(tools));
                completion.catch(() => { }); // a stop can leave the request in flight
                const response = await Promise.race([completion, this.stopped]);
                if ((response as any)?.stopped) return null;
                return response as ICompleteResponse;
            } catch (error) {
                if (this.stopReason || attempt > 0 || !backgrounded || isAbortError(error)) throw error;
                this.log(`Model call failed while the app was in the background (${(error as Error)?.message}) - retrying once the app is back`);
            } finally {
                subscription.remove();
            }
            await Promise.race([untilForeground(), this.stopped]);
            if (this.stopReason) return null;
        }
    }

    /** Ask the model for the next tool call. Resolves null when it answered with plain text. */
    async #nextCall(functions: BrowserToolSchema[] = this.functions): Promise<ToolCall | null> {
        const messages = this.#messages();
        const startedAt = Date.now();
        let response: ICompleteResponse | null;
        try {
            response = await this.#complete(messages, functions);
        } catch (error: any) {
            if (this.stopReason || !this.records.at(-1)?.image) throw error;
            // The model turned out not to take images - carry on without screenshots.
            this.log(`Image request failed (${error?.message}) - disabling screenshots`);
            this.#disableScreenshots();
            return this.#nextCall(functions.filter((f) => f.name !== SCREENSHOT_TOOL.name));
        }
        if (!response) return null;

        this.#trackUsage(messages, response, Date.now() - startedAt);
        this.lastText = stripThinking(response.textResponse || '');
        const toolCall = response.toolCalls?.[0];
        if (toolCall?.function?.name) {
            const raw = {
                id: toolCall.id || `call_${generateUUID().replace(/-/g, '').slice(0, 24)}`,
                name: toolCall.function.name,
                arguments: typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments : JSON.stringify(toolCall.function.arguments ?? {}),
                ...(toolCall.extra_content ? { extra_content: toolCall.extra_content } : {}),
            };
            return { name: raw.name, args: normalizeArgs(toolCall.function.arguments), raw };
        }
        const parsed = parseJsonAction(this.lastText);
        if (!parsed) return null;
        return {
            ...parsed,
            raw: { id: `call_${generateUUID().replace(/-/g, '').slice(0, 24)}`, name: parsed.name, arguments: JSON.stringify(parsed.args) },
        };
    }

    async #execute(call: ToolCall, step: number) {
        const { name } = call;
        const { note, ...args } = call.args || {};
        const noted = typeof note === 'string' && note.trim() ? this.#saveNote(note) : false;
        let full: string;
        let short: string;
        let medium: string | null = null;
        let result: ActionResult | null = null;
        let progressed = false;
        let relevant = noted;

        const refuse = (refusal: string) => {
            this.records.push({ call, full: `${refusal}\n\n[Step ${step} of ${MAX_STEPS}]`, short: refusal, medium: null });
            this.stall++;
            this.drift++;
        };

        if (name === 'type' && PLACEHOLDER_TEXT.some((re) => re.test(String(args.text ?? ''))))
            return refuse(`Not typed: "${clip(args.text, 60)}" is a placeholder, not a real value. Never type made-up credentials or details. If you need them, call ask_user and ask the user to sign in in the browser.`);

        const madeUp = name === 'navigate' ? this.#madeUpUrl(args.url) : null;
        if (madeUp)
            return refuse(`Not opened: ${clip(args.url, 120)} contains an id (${madeUp}) that is not on any page you saw, so the address is probably made up. Click the link on the page, or use the site's search, instead.`);

        if (name === 'screenshot') {
            const refusal = !this.vision
                ? 'There is no tool named "screenshot".'
                : this.screenshotsLeft <= 0
                    ? 'No screenshots left for this session. Use the page state.'
                    : this.records.at(-1)?.call?.name === 'screenshot'
                        ? 'You just took a screenshot. Act on it or use the page state.'
                        : null;
            if (refusal) return refuse(refusal);
            this.screenshotsLeft--;
        }

        if (name === 'ask_user') {
            const reply = await this.#askUser(String(args.question || 'I need your help to continue.'));
            this.#resetStall();
            if (reply.reset) return;
            full = reply.full;
            short = medium = reply.short;
            progressed = relevant = true;
        } else if (BROWSER_TOOL_NAMES.has(name)) {
            result = await this.session!.run(name, args).catch((error: any): ActionResult => ({
                ok: false,
                outcome: `Failed: ${error?.message || error}`,
                state: '',
                page: { url: '', title: '', favicon: '' },
                thumbnail: null,
            }));
            this.#recordStep(name, args, result);
            this.lastBlocker = result.blocker || null;
            // Element ids change as a page lazy-loads; the label and page say what was really clicked.
            if (result.target) call.target = `${result.target}@${result.page?.url || ''}`;
            const seen = this.#madeProgress(result);
            progressed = seen.fresh || noted;
            relevant ||= seen.relevant;
            full = `${result.outcome}\n\n${result.state}`;
            short = `${result.outcome}${result.page?.title ? ` (on "${clip(result.page.title, 60)}")` : ''}`;
            if (name === 'read_page') medium = clip(result.state, 1_500);
            if (name === 'screenshot' && result.image)
                full += `\n\nThe screenshot is attached below. ${this.screenshotsLeft} screenshot(s) left.`;
        } else {
            full = short = `There is no tool named "${name}". Use one of: ${this.functions.map((f) => f.name).join(', ')}.`;
        }

        // Repeating an action is fine while it keeps showing new things (scrolling a long list). Clicks
        // and keys must show something related to the task - pages that lazy-load keep changing anyway.
        const moved = ['scroll', 'read_page', 'wait'].includes(name) ? progressed : relevant;
        const loop = moved ? null : this.#loopOf(call);
        if (loop && this.loopWarnings++ === 0)
            full += `\n\nSTOP: you are repeating the same actions in a loop (${loop}) and it is not working. Try a completely different approach - a different element, a direct URL, or a keyboard key. If you are stuck, call ask_user.`;
        // Still looping after being told to stop: give up instead of burning steps.
        else if (loop && this.loopWarnings > 1)
            this.giveUpReason = `I kept repeating the same actions (${loop}) without getting anywhere`;

        if (relevant && !loop) this.drift = 0;
        else if (++this.drift >= DRIFT_LIMIT)
            this.giveUpReason ??= `the last ${this.drift} steps found nothing related to the task`;

        if (progressed) this.#resetStall({ drift: false });
        else if (++this.stall >= STALL_LIMIT)
            this.giveUpReason ??= `I made no progress in the last ${this.stall} steps`;
        else if (this.stall >= STALL_WARN && !this.stallWarned) {
            this.stallWarned = true;
            full += `\n\nWARNING: your last ${this.stall} actions showed nothing new - you are not making progress. Try a completely different approach (a direct URL, a different element, the site's search). If the site will not cooperate, call done with success=false and explain what is in the way. After ${STALL_LIMIT - this.stall} more steps without progress this session ends.`;
        }

        this.records.push({
            call,
            full: `${full}\n\n[Step ${step} of ${MAX_STEPS}]`,
            short,
            medium,
            // Only ever sent while this is the latest record (see #messages).
            image: name === 'screenshot' ? result?.image || null : null,
        });
        if (result && (await this.#pauseForBlocker(result, step))) this.#resetStall();
    }

    /**
     * What a step showed the agent that it had not seen this session. `fresh`: a new URL or new page
     * lines (element ids and digits are ignored, so re-numbering, counters and scroll offsets do not
     * count). `relevant`: one of those new lines mentions the task (see #terms) - new pages that have
     * nothing to do with the task are drift, not progress. A failed action never counts, but what it
     * showed is still remembered.
     */
    #madeProgress(result: Partial<ActionResult> | null) {
        let fresh = false;
        let relevant = false;
        const url = result?.page?.url;
        if (url && !this.seenUrls.has(url)) {
            this.seenUrls.add(url);
            fresh = true;
        }
        const state = String(result?.state || '');
        for (const idToken of state.match(ID_TOKEN) || []) this.seenIds.add(idToken);
        for (const idToken of String(url || '').match(ID_TOKEN) || []) this.seenIds.add(idToken);
        const terms = this.#terms(hostOf(url));
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

    /** Task words that count on this site - the site's own name ("Micro Center" on microcenter.com) is on every page. */
    #terms(host: string | null) {
        const compact = String(host || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return this.taskTerms.filter((term) => !compact.includes(term));
    }

    /**
     * A navigate to an address with an id (product, listing, post) that never appeared on a page,
     * in the task or in a visited URL - small models make these up. Only the path is checked, so
     * search URLs with any query still work.
     */
    #madeUpUrl(url: string): string | null {
        let path: string;
        try {
            path = decodeURIComponent(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname);
        } catch {
            return null;
        }
        return (path.match(ID_TOKEN) || []).find((idToken) => !this.seenIds.has(idToken)) || null;
    }

    /** drift: false when the step only showed new (maybe unrelated) content */
    #resetStall({ drift = true }: { drift?: boolean } = {}) {
        this.stall = 0;
        this.stallWarned = false;
        if (!drift) return;
        // Lazy-loading noise must not wipe a loop warning - only real help or going back does.
        this.drift = 0;
        this.loopWarnings = 0;
    }

    /////////////////////////////
    // Progress checks
    /////////////////////////////

    #checkpointDue(step: number) {
        if (step < 5 || this.checkpoints >= MAX_CHECKPOINTS || step - this.lastCheckpoint < 3) return false;
        if (this.drift >= DRIFT_CHECK) return true;
        // Left a page that really had task content (not just a weekly-ad price) and found nothing since.
        const best = this.#bestPage();
        if (best && (best.relevant ?? 0) >= 2 && best.url !== this.currentUrl && this.drift >= 2) return true;
        return step - this.lastCheckpoint >= CHECK_EVERY;
    }

    /**
     * Reflection outside the action loop: one short call with the task, what was collected and the
     * last few steps, asking whether to keep going, answer now, go back to the most useful page, or
     * give up. Small models judge this far better as its own question than while picking clicks.
     * Resolves whether the session ended.
     */
    async #checkpoint(step: number): Promise<boolean> {
        this.checkpoints++;
        this.lastCheckpoint = step;
        const best = this.#bestPage();
        const struggling = this.drift >= DRIFT_CHECK || this.stall >= STALL_WARN;
        const recent = this.trace.steps
            .slice(-8)
            .map((s) => `- ${s.label}${s.ok ? '' : ' (failed)'}${s.title ? ` - on "${clip(s.title, 60)}"` : ''}`)
            .join('\n');
        const notes = this.notes.map((n) => `- ${n}`).join('\n') || '(none)';
        const messages = [
            {
                role: 'system',
                content: `You check on a browser agent that is doing a task for the user. Decide what it should do next. Reply with ONE word on the first line:
CONTINUE - it is on track and the task needs more work.
FINISH - the information below already answers the task (or the task's action is done), so it should stop and answer now.
BACK - it wandered off to pages unrelated to the task and should return to the most useful page.
GIVE_UP - the site clearly does not have what the task needs, or there is no realistic way forward.
Prefer FINISH over BACK when the useful pages above already show what the task asks for.
On the second line write one short sentence: for CONTINUE or BACK, the single next step to take; for FINISH or GIVE_UP, why.`,
            },
            {
                role: 'user',
                content: `Task: ${this.task}${this.#earlierSummary(300)}\n\nAgent notes:\n${notes}${this.#visitedSummary({ includeCurrent: true })}${this.#sentSummary()}\n\nLast steps:\n${recent}\n\nCurrent page:\n${clip(this.records.at(-1)?.full || this.initialState, 2_000)}`,
            },
        ];
        let verdict = 'CONTINUE';
        let reason = '';
        try {
            const startedAt = Date.now();
            const response = await this.#complete(messages, []);
            if (!response) return true;
            this.#trackUsage(messages, response, Date.now() - startedAt);
            const lines = stripThinking(response.textResponse || '')
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
            const word = lines[0]?.match(/\b(CONTINUE|FINISH|BACK|GIVE[_ ]?UP)\b/i)?.[1];
            if (!word) return false; // no usable verdict - carry on as before
            verdict = word.toUpperCase().replace(/[_ ]/, '_');
            reason = clip((lines[0] || '').replace(/^\W*(CONTINUE|FINISH|BACK|GIVE[_ ]?UP)\W*/i, '') || lines[1] || '', 200);
        } catch (error: any) {
            this.log('Progress check failed:', error?.message);
            return false;
        }
        // A healthy run is never ended by a check - giving up needs real signs of being stuck.
        if (verdict === 'GIVE_UP' && !struggling) verdict = 'CONTINUE';
        if (verdict === 'BACK' && (!best || best.url === this.currentUrl)) verdict = 'CONTINUE';
        // Sent back once and wandered off again: answer with what the best page had.
        if (verdict === 'BACK' && this.wentBack) verdict = 'FINISH';
        this.log(`Progress check at step ${step}: ${verdict}${reason ? ` - ${reason}` : ''}`);
        this.#recordStep('checkpoint', { verdict, title: best?.title }, { ok: true, page: lastPageOf(this.trace) });

        if (verdict === 'GIVE_UP') {
            this.giveUpReason = `I could not find a way forward${reason ? ` (${reason.replace(/\.$/, '')})` : ''}`;
            await this.#giveUp(this.giveUpReason);
            return true;
        }
        if (verdict === 'FINISH') {
            const { missing, answer } = await this.#finalAnswer(reason, { canContinue: step < MAX_STEPS - 2 });
            if (this.stopReason) return true;
            if (!missing) {
                this.#finish('done', answer);
                return true;
            }
            this.plan = `Still missing: ${missing}`;
            this.drift = 0;
            return false;
        }
        if (verdict === 'BACK' && best) {
            this.wentBack = true;
            const args = { url: best.url };
            const result = await this.session!.run('navigate', args).catch(() => null);
            if (result) {
                this.#recordStep('navigate', args, result);
                this.#madeProgress(result);
                this.lastBlocker = result.blocker || null;
                const call: ToolCall = {
                    name: 'navigate',
                    args,
                    raw: { id: `call_${generateUUID().replace(/-/g, '').slice(0, 24)}`, name: 'navigate', arguments: JSON.stringify(args) },
                };
                this.records.push({
                    call,
                    full: `You had wandered away from the task, so you were taken back to the most useful page so far.${reason ? ` Next: ${reason}` : ''}\n\n${result.outcome}\n\n${result.state}\n\n[Step ${step} of ${MAX_STEPS}]`,
                    short: `Taken back to "${clip(best.title, 60)}" after wandering off`,
                    medium: null,
                });
            }
        }
        this.plan = reason || this.plan;
        // "Keep going" does not reset the stall and drift counters - only actually going back does.
        if (verdict === 'BACK') this.#resetStall();
        return false;
    }

    /** The visited page with the most task-related content (prices alone do not count). */
    #bestPage(): DigestPage | null {
        let best: DigestPage | null = null;
        for (const page of this.visited.values()) if (page.relevant && (!best || page.score > best.score)) best = page;
        return best;
    }

    /**
     * The agent is clearly not getting anywhere (or hit its budget): end the session and hand back
     * to the user with whatever was found, instead of letting a struggling model spin.
     */
    async #giveUp(reason: string) {
        this.log(`Giving up: ${reason}`);
        const { answer } = await this.#finalAnswer(`Stopped early because ${reason}. Say what was found so far and where it got stuck.`, { canContinue: false });
        if (this.stopReason) return;
        this.trace.gaveUp = reason;
        this.#finish('incomplete', `I stopped early because ${reason}.\n\n${answer}`);
    }

    /**
     * Sign-in walls, bot checks and verification codes are a hard stop: when the page is
     * confidently one of those, ask the user before the model gets another turn.
     * Resolves whether the session paused.
     */
    async #pauseForBlocker(result: ActionResult, step: number): Promise<boolean> {
        const blocker = result?.blocker;
        if (!blocker?.wall || this.stopReason) return false;
        const site = hostOf(result.page?.url) || 'This site';
        const key = `${site}:${blocker.kind}`;
        if (this.acknowledged.has(key)) return false;
        this.acknowledged.add(key);

        const question = BLOCKER_QUESTIONS[blocker.kind](site);
        this.log(`Paused for ${blocker.kind} on ${site} (score ${blocker.score})`);
        const reply = await this.#askUser(question, blocker);
        if (reply.reset) return true;
        const call: ToolCall = {
            name: 'ask_user',
            args: { question },
            raw: { id: `call_${generateUUID().replace(/-/g, '').slice(0, 24)}`, name: 'ask_user', arguments: JSON.stringify({ question }) },
        };
        this.records.push({
            call,
            full: step ? `${reply.full}\n\n[Step ${step} of ${MAX_STEPS}]` : reply.full,
            short: reply.short,
            medium: reply.short,
        });
        return true;
    }

    /**
     * Pause until the user replies in the chat (or takes over the browser and continues).
     * The reply comes back with a fresh page state, since the user may have changed the page.
     * When the user got past a blocker or drove the browser themselves, the context is reset instead.
     */
    async #askUser(question: string, blocker: Blocker | null = this.lastBlocker): Promise<{ full: string; short: string; reset?: boolean }> {
        this.question = question;
        this.trace.status = 'needs-help';
        this.#recordStep('ask_user', { question }, { ok: true, page: lastPageOf(this.trace) });
        this.#emit();
        try { this.onNeedsHelp?.(question); } catch { }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const reply = await Promise.race([
            new Promise<string | null>((resolve) => (this.pendingReply = resolve)),
            new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), HELP_TIMEOUT_MS))),
        ]);
        clearTimeout(timer);
        this.pendingReply = null;
        this.question = null;
        if (this.stopReason) return { full: 'The session was stopped.', short: 'The session was stopped.' };

        this.trace.status = 'running';
        const tookOverNow = !!this.session?.isTakenOver;
        this.session?.handBack();
        this.#emit();
        const short = reply === undefined
            ? 'The user did not reply in time. Continue without their help, or call done and explain what you need.'
            : `The user replied: ${reply}`;

        const page = await this.session!.run('state').catch(() => null);
        if (!page?.state) return { full: short, short };
        if ((blocker || page.tookOver || tookOverNow) && !page.blocker?.wall) {
            this.#resetContext({ blocker, tookOver: page.tookOver || tookOverNow, reply: reply ?? null, page });
            return { full: short, short, reset: true };
        }
        let full = `${short}\n\nCurrent page state:\n${page.state}`;
        if (page.blocker?.wall)
            full += "\n\nThe page is still blocked. Do not try to get past it on your own. If the user's reply gives you what you need (like credentials or a code), use exactly that. Otherwise call ask_user again, or call done and explain.";
        return { full, short };
    }

    /////////////////////////////
    // Context management
    /////////////////////////////

    /**
     * After the user signs in (or otherwise drives the browser) the site usually looks completely
     * different, so the step history is worse than useless. Start over from the task with a short
     * note of what already happened and the page as it is now.
     */
    #resetContext({ blocker, tookOver, reply, page }: { blocker: Blocker | null; tookOver?: boolean; reply: string | null; page: ActionResult }) {
        const before = this.trace.steps
            .filter((step) => step.action !== 'ask_user')
            .slice(-6)
            .map((step) => step.label)
            .join('; ');
        const what = blocker ? BLOCKER_RESOLVED[blocker.kind] || 'handled the page' : tookOver ? 'used the browser themselves' : 'helped';
        const said = reply ? ` and said: "${clip(reply, 200)}"` : '';
        this.progress.push(`${before ? `Steps before: ${before}. ` : ''}Then the user ${what}${said}.`);
        this.records = [];
        this.nudges = 0;
        this.#resetStall();
        this.#madeProgress(page);
        this.initialState = page.state;
        this.lastBlocker = page.blocker || null;
        this.log(`Context reset after the user ${what}`);
    }

    /** Build the compacted message list: system, task, then records (only the latest in full). */
    #messages() {
        const system = systemPrompt({ maxSteps: MAX_STEPS, screenshots: this.vision ? MAX_SCREENSHOTS : 0 });
        const progress = this.progress.length ? `\n\nProgress so far:\n${this.progress.map((note) => `- ${note}`).join('\n')}` : '';
        const notes = this.notes.length ? `\n\nYour notes:\n${this.notes.map((n) => `- ${n}`).join('\n')}` : '';
        // The date sits next to the task too - small models otherwise fall back to their training year.
        const sites = this.#visitedSummary();
        const plan = this.plan ? `\n\nNext step (from your last progress check): ${this.plan}` : '';
        const task = `Task: ${this.task}\nToday is ${new Date().toDateString()}.${this.#earlierSummary()}${progress}${notes}${sites}${plan}`;
        const intro = this.records.length
            ? task
            : `${task}\n\nCurrent page state${progress ? ' (the page has changed - read it fresh and only use ids from here)' : ''}:\n${this.initialState}`;

        const budget = this.contextLimit * 4 * 0.7 - system.length - intro.length;
        const contents = this.records.map((record, i) => {
            if (i === this.records.length - 1) return record.full;
            if (record.medium && i >= this.records.length - 3) return record.medium;
            return record.short;
        });
        // Over budget: shorten from the oldest record forward, then drop the oldest records.
        let size = contents.reduce((sum, c) => sum + c.length + 80, 0);
        for (let i = 0; i < contents.length - 1 && size > budget; i++) {
            size -= contents[i].length - this.records[i].short.length;
            contents[i] = this.records[i].short;
        }
        let first = 0;
        while (size > budget && first < contents.length - 1) size -= contents[first++].length + 80;

        const messages: any[] = [
            { role: 'system', content: system },
            { role: 'user', content: first ? `${intro}\n\n(${first} earlier steps omitted)` : intro },
        ];
        for (let i = first; i < this.records.length; i++) {
            const { call } = this.records[i];
            messages.push({
                role: 'assistant',
                content: '',
                tool_calls: [{
                    id: call.raw.id,
                    type: 'function',
                    ...(call.raw.extra_content ? { extra_content: call.raw.extra_content } : {}),
                    function: { name: call.raw.name, arguments: call.raw.arguments },
                }],
            });
            messages.push({ role: 'tool', tool_call_id: call.raw.id, content: contents[i] });
            // A screenshot is only shown while it is the latest step - images are expensive.
            const image = this.vision && i === this.records.length - 1 ? this.records[i].image : null;
            if (image)
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Screenshot of the current screen:' },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'low' } },
                    ],
                });
        }
        if (this.nudge) messages.push({ role: 'user', content: this.nudge });
        this.nudge = null;
        return messages;
    }

    /**
     * Keep the lines of a page that look relevant to the task: task words (not the site's own name),
     * prices and numbers, and the line right after a match (labels are often followed by their value).
     * Kept per page, so the useful page of a site is not replaced by the next one on the same site.
     */
    #digest(result: Partial<ActionResult>) {
        const url = String(result?.page?.url || '').split('#')[0];
        if (!/^https?:/i.test(url) || !result.state) return;
        this.currentUrl = url;
        const terms = this.#terms(hostOf(url));
        const lines = String(result.state)
            .split('\n')
            .filter((line) => /^\[T?\d+\]/.test(line))
            .map((line) => line.replace(/^\[T?\d+\]\s*/, ''));
        let previousMatched = false;
        const scored = lines.map((line) => {
            const lower = line.toLowerCase();
            let score = terms.filter((term) => lower.includes(term)).length;
            const matched = score > 0;
            if (/[$€£¥]\s?\d|\d[\d,.]*\s?(usd|eur|gbp|%)\b/i.test(line)) score += 1.5;
            if (previousMatched) score += 1;
            previousMatched = matched;
            return { line: clip(line, 160), score, matched };
        });
        const page: DigestPage = this.visited.get(url) || { url, title: '', lines: [], score: 0 };
        page.title = clip(result.page?.title || page.title, 60);
        // Scrolling and reading the same page adds to what it already had.
        const merged = new Map(page.lines.map((entry) => [entry.line, entry]));
        for (const entry of scored) if (entry.score >= 1.5 && !merged.has(entry.line)) merged.set(entry.line, entry);
        page.lines = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, DIGEST_LINES);
        page.score = page.lines.reduce((sum, entry) => sum + entry.score, 0);
        page.relevant = page.lines.filter((entry) => entry.matched).length;
        if (!page.lines.length) return;
        this.visited.set(url, page);
        // Over the limit: forget the least useful page, never the current one.
        while (this.visited.size > DIGEST_PAGES) {
            const worst = [...this.visited.values()].filter((p) => p.url !== url).sort((a, b) => a.score - b.score)[0];
            this.visited.delete(worst.url);
        }
    }

    #visitedSummary({ includeCurrent = false }: { includeCurrent?: boolean } = {}) {
        const pages = [...this.visited.values()]
            .filter((page) => includeCurrent || page.url !== this.currentUrl)
            .sort((a, b) => b.score - a.score);
        if (!pages.length) return '';
        return `\n\nMost useful pages so far (key lines - their ids are no longer valid, but you can navigate back to the URL):\n${pages
            .map(({ url, title, lines }) => `- ${title ? `"${title}" ` : ''}${clip(url, 120)}: ${lines.map((e) => e.line).join(' | ')}`)
            .join('\n')}`;
    }

    /**
     * Turn the agent's `done` into the final answer with one short call over everything it collected
     * (notes and page digests), since small models write `done` from the last page only.
     * It can also send the agent back to work when part of the task is clearly missing.
     */
    async #finalAnswer(draft: string, { canContinue }: { canContinue: boolean }): Promise<{ missing: string | null; answer: string }> {
        const notes = this.notes.map((n) => `- ${n}`).join('\n') || '(none)';
        const latest = this.records.at(-1)?.full || this.initialState;
        const askMissing = canContinue && this.doneChecks < MAX_DONE_CHECKS;
        const messages = [
            {
                role: 'system',
                content:
                    'You write the final answer of a browser agent for the user, using ONLY the information collected below - never invent facts. Include the concrete values, names and links the task asks for. If the agent hit a real blocker (sign-in needed, site blocked, item does not exist), explain it. If the task was to post, send or submit something, only say it went through when "Data sent to sites" shows it - otherwise say it may not have been sent.',
            },
            {
                role: 'user',
                content: `Task: ${this.task}${this.#earlierSummary()}\n\nAgent notes:\n${notes}${this.#visitedSummary({ includeCurrent: true })}${this.#sentSummary()}\n\nLast page:\n${clip(latest, 3_000)}\n\nAgent's draft answer:\n${draft || '(none)'}\n\nReply in this format:\nFirst line: ${askMissing ? 'COMPLETE, or MISSING: <what part of the task has no information yet, in a few words>' : 'COMPLETE'}\nThen a blank line, then the final answer for the user.`,
            },
        ];
        try {
            const startedAt = Date.now();
            const response = await this.#complete(messages, []);
            if (!response) return { missing: null, answer: draft };
            this.#trackUsage(messages, response, Date.now() - startedAt);
            const text = stripThinking(response.textResponse || '').trim();
            const [first = '', ...rest] = text.split('\n');
            const answer = rest.join('\n').trim() || draft;
            const missing = first.match(/^\W*MISSING\W*:?\s*(.+)$/i)?.[1];
            if (askMissing && missing) {
                this.doneChecks++;
                this.log(`Final answer check: not finished - ${missing}`);
                return { missing: clip(missing, 200), answer };
            }
            return { missing: null, answer };
        } catch (error: any) {
            this.log('Final answer step failed:', error?.message);
            return { missing: null, answer: draft };
        }
    }

    /**
     * What this browser already did earlier in the chat, when this session continues one. The task
     * often only makes sense with it ("now remove it from my cart"). Only the newest earlier task
     * brings its notes - older ones are covered by its summary.
     */
    #earlierSummary(maxSummary = 600) {
        if (!this.earlier.length) return '';
        const lines = this.earlier.map(({ task, status, summary, notes }, i) => {
            const outcome = status === 'done' ? 'Result' : status === 'incomplete' ? 'Partly done' : status === 'stopped' ? 'Stopped by the user' : 'Failed';
            const noted = i === this.earlier.length - 1 && notes?.length ? `\n  Notes: ${notes.slice(-8).map((n) => clip(n, 160)).join(' | ')}` : '';
            return `- Task: ${clip(task, 200)}\n  ${outcome}: ${summary ? clip(summary, maxSummary) : '(none)'}${noted}`;
        });
        // After the last task the user may have used the browser themselves - the page they left it on
        // is where this session starts, and usually what their request is about.
        const left = this.earlier.at(-1)?.userPage;
        const where = this.startUrl
            ? 'opened on the start address'
            : left
                ? `reopened where the user left it after the last task: "${clip(left.title || '', 80)}" (${clip(left.url, 160)}) - the user browsed there themselves, so this page may differ from what the last task saw`
                : 'reopened on the page it ended on';
        return `\n\nThis continues an earlier browser session - the browser was ${where}, with the same sign-ins and cart. Earlier tasks in it:\n${lines.join('\n')}`;
    }

    /** Everything the page sent to sites this session - ground truth for "was it posted/sent". */
    #sentSummary() {
        const sent = this.trace.steps.flatMap((step) =>
            (step.sent || []).map(
                (r) => `${step.label}: ${r.method} ${r.label} -> ${r.method === 'WS' ? 'sent' : r.status ? `${r.status}${r.ok ? ' OK' : ' failed'}` : r.ok === false ? 'failed' : 'no reply'}`,
            ),
        );
        if (!sent.length) return '\n\nData sent to sites: nothing was sent this session.';
        return `\n\nData sent to sites (the site really received these):\n${sent.slice(-10).map((s) => `- ${s}`).join('\n')}`;
    }

    /** Resolves whether the note is new */
    #saveNote(note: string) {
        const text = clip(note, 300);
        if (this.notes.includes(text)) return false;
        this.notes.push(text);
        if (this.notes.length > 20) this.notes.shift();
        this.trace.notes = [...this.notes];
        return true;
    }

    #disableScreenshots() {
        this.vision = false;
        this.screenshotsLeft = 0;
        this.functions = this.functions.filter((f) => f.name !== SCREENSHOT_TOOL.name);
        for (const record of this.records) record.image = null;
        const latest = this.records.at(-1);
        if (latest) latest.full += '\n\n(Screenshots are not supported by this model - use the page state.)';
    }

    #pushNudge(text: string) {
        this.nudge = text;
    }

    /** Detects the agent cycling through the same 1-3 actions (e.g. click "Post" -> type -> click "Post"...). */
    #loopOf(call: ToolCall): string | null {
        const sig = (c: ToolCall) => {
            // A changing note does not make a repeated action new, nor does a renumbered id for the same element.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { note: _note, id: elementId, ...rest } = c.args || {};
            return `${c.name}:${c.target || elementId}:${JSON.stringify(rest)}`;
        };
        const history = [...this.records.map((r) => sig(r.call)), sig(call)];
        for (let size = 1; size <= 3; size++) {
            const span = size * LOOP_REPEATS;
            if (history.length < span) break;
            const tail = history.slice(-span);
            if (tail.every((s, i) => s === tail[i % size]))
                return [...this.records.map((r) => r.call), call]
                    .slice(-size)
                    .map((c) => c.name)
                    .join(' -> ');
        }
        return null;
    }

    /** Session tokens, from the provider's usage report or an estimate when it sent none. */
    #trackUsage(messages: any[], response: ICompleteResponse, _durationMs: number) {
        let prompt = response.metrics?.prompt_tokens || 0;
        let completion = response.metrics?.completion_tokens || 0;
        if (prompt + completion <= 0) {
            // Provider did not report usage - estimate so the user still sees what the session costs.
            this.estimatedTokens = true;
            prompt = Math.ceil(JSON.stringify(messages).length / 4);
            completion = Math.ceil(JSON.stringify(response.toolCalls || response.textResponse || '').length / 4);
        }
        this.trace.tokens.prompt += prompt;
        this.trace.tokens.completion += completion;
        this.trace.tokens.total += prompt + completion;
        this.#emit();
    }

    /////////////////////////////
    // Trace + UI
    /////////////////////////////

    #recordStep(action: string, args: Record<string, any>, result: Partial<ActionResult> = {}) {
        if (result.state) this.#digest(result);
        const page = result.page || { url: '', title: '', favicon: '' };
        this.trace.steps.push({
            at: new Date().toISOString(),
            action,
            label: stepLabel(action, args, result),
            ok: result.ok !== false,
            url: page.url || null,
            title: page.title || null,
            favicon: page.favicon || null,
            thumbnail: result.thumbnail || null,
            // What the page sent to the site during this step (metadata only, see session.ts).
            sent: Array.isArray(result.sent) && result.sent.length
                ? result.sent.slice(0, 5).map(({ label, method, status, ok }) => ({ label, method, status, ok }))
                : null,
        });
        if (result.thumbnail) {
            try { this.onFrame?.(result.thumbnail); } catch { }
        }
        this.#scheduleTraceSave();
        this.#emit();
    }

    #scheduleTraceSave() {
        if (this.traceSaveTimer) return;
        this.traceSaveTimer = setTimeout(() => {
            this.traceSaveTimer = null;
            BrowserTraces.save(this.trace);
        }, TRACE_SAVE_INTERVAL_MS);
    }

    #finish(status: BrowserTraceStatus, summary: string | null) {
        this.trace.status = status;
        this.trace.summary = summary;
        this.trace.endedAt = new Date().toISOString();
        this.question = null;
        this.#emit();
    }

    /** The live state shown in the chat card. Thumbnails are not included - they go through onFrame. */
    get snapshot(): BrowserSessionSnapshot {
        const last = this.trace.steps.at(-1) || null;
        return {
            sessionId: this.id,
            task: this.task,
            profile: this.trace.profile,
            status: this.trace.status,
            summary: this.trace.summary,
            question: this.question,
            tokens: { ...this.trace.tokens, estimated: this.estimatedTokens },
            stepCount: this.trace.steps.length,
            step: last ? { label: last.label, ok: last.ok, url: last.url, title: last.title, favicon: last.favicon } : null,
            recentSteps: this.trace.steps.slice(-6).map(({ label, ok, favicon, url }) => ({ label, ok, favicon, url })),
            sites: sitesOf(this.trace.steps),
            continuedFrom: this.trace.continuedFrom ?? null,
            startedAt: this.trace.startedAt,
            endedAt: this.trace.endedAt,
        };
    }

    #emit() {
        try {
            this.onUpdate(this.snapshot);
        } catch { }
    }

    #resultForParent() {
        const { status, summary, steps } = this.trace;
        const visited = sitesOf(steps).map((s) => s.host).join(', ') || 'none';
        const last = steps.filter((s) => s.url).at(-1);
        const lastPage = last ? `"${last.title || ''}" (${last.url})` : 'none';
        switch (status) {
            case 'done':
                return `The browser task is complete.\n\nResult:\n${summary}\n\nSites visited: ${visited}`;
            case 'incomplete':
                if (this.trace.gaveUp)
                    return `The browser agent gave up: ${this.trace.gaveUp}. Do NOT start the browser task again on your own. Tell the user what it found, and suggest they do the step themselves or try a more capable model.\n\nWhat it found:\n${summary}\n\nSites visited: ${visited}`;
                return `The browser agent could not fully complete the task.\n\nWhat it found:\n${summary}\n\nSites visited: ${visited}`;
            case 'stopped':
                return this.stopReason === 'aborted'
                    ? 'The browser session was cancelled.'
                    : `The user stopped the browser session before it finished. Steps taken: ${steps.map((s) => s.label).slice(-8).join('; ')}. Last page: ${lastPage}. Do not retry the browser task; ask the user how they want to proceed.`;
            default:
                return `The browser session failed: ${summary}. Let the user know.`;
        }
    }
}

/** Resolves once the app is in front again (right away when it already is). */
function untilForeground(): Promise<void> {
    if (AppState.currentState === 'active') return Promise.resolve();
    return new Promise((resolve) => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            subscription.remove();
            resolve();
        });
    });
}

/** The page of the latest step, for steps that do not load one (ask_user, checkpoints). */
function lastPageOf(trace: BrowserTrace) {
    const last = trace.steps.at(-1);
    return { url: last?.url || '', title: last?.title || '', favicon: last?.favicon || '' };
}

/** Task words worth matching on pages, cut to a 6-letter stem so "refurbished" matches "Refurb". */
export function taskTerms(task = '') {
    const words = String(task).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu) || [];
    return [
        ...new Set(
            words
                .map((word) => word.replace(/[.-]+$/, ''))
                .filter((word) => word.length >= 3 && !DIGEST_STOPWORDS.has(word) && !/^[\d.,-]+$/.test(word))
                .map((word) => (word.length > 7 ? word.slice(0, 6) : word)),
        ),
    ];
}

function hostOf(url: any) {
    try {
        return new URL(String(url)).host.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function stripThinking(text = '') {
    return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function normalizeArgs(args: unknown): Record<string, any> {
    if (typeof args === 'string') return safeJsonParse(args, {}) || {};
    return args && typeof args === 'object' ? (args as Record<string, any>) : {};
}

/** Pull a {"tool": ..., "args": ...} action out of a plain-text reply (stray text calls). */
export function parseJsonAction(text = ''): { name: string; args: Record<string, any> } | null {
    const cleaned = String(text).replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = safeJsonParse(cleaned.slice(start, end + 1), null);
    if (!obj || typeof obj !== 'object') return null;
    const name = obj.tool || obj.name || obj.action || obj.function;
    if (typeof name !== 'string') return null;
    return { name, args: normalizeArgs(obj.args ?? obj.arguments ?? obj.parameters ?? obj.input ?? {}) };
}
