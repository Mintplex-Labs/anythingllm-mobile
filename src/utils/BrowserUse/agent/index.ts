import { AppState } from 'react-native';
import { generateUUID } from '@/utils/constants';
import { isAbortError } from '@/utils/chat/abort';
import { type ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import BrowserSession from '../session';
import BrowserTraces, { lastPageOf, resumeUrlOf, sitesOf, type BrowserTrace, type BrowserTraceStatus } from '../traces';
import { BROWSER_TOOLS, BROWSER_TOOL_NAMES, CONTROL_TOOLS, SCREENSHOT_TOOL, toolDefinitions, type BrowserToolSchema } from '../tools';
import { stepLabel } from '../stepLabels';
import { clip, stripThinking } from '../text';
import { hostOf } from '../urls';
import { type ActionResult, type Blocker } from '../types';
import {
    CHECK_EVERY,
    DRIFT_CHECK,
    HELP_TIMEOUT_MS,
    MAX_CHECKPOINTS,
    MAX_DONE_CHECKS,
    MAX_EARLIER_TASKS,
    MAX_NOTES,
    MAX_NUDGES,
    MAX_SCREENSHOTS,
    MAX_SESSION_TOKENS,
    MAX_STEPS,
    PAGE_STATE_MAX_CHARS,
    PAGE_STATE_MIN_CHARS,
    TRACE_SAVE_INTERVAL_MS,
} from '../constants';
import { callFromResponse, syntheticCall } from './calls';
import { buildMessages } from './context';
import PageDigests from './digest';
import { refusalFor } from './guards';
import ProgressTracker from './progress';
import {
    BLOCKER_RESOLVED,
    NUDGE_OUT_OF_STEPS,
    NUDGE_TOOL_CALL,
    STILL_BLOCKED,
    blockerQuestion,
    earlierSummary,
    notesList,
    resultForParent,
    sentSummary,
    systemPrompt,
    taskBriefing,
} from './prompts';
import { checkpointMessages, finalAnswerMessages, parseCheckpoint, parseFinalAnswer } from './reflection';
import { type AgentRecord, type BrowserAgentLLM, type BrowserAgentResume, type BrowserSessionSnapshot, type EarlierTask, type ToolCall } from './types';

export type { BrowserAgentLLM, BrowserAgentResume, BrowserSessionSnapshot } from './types';

/**
 * The browser sub-agent - a port of the desktop BrowserAgent
 * (server/utils/agents/aibitat/plugins/browser-use/agent.js). It runs its own tool loop with the
 * user's chat model, driving a WebView through ../session.
 *
 * This class is the loop and its policy; the parts are in this folder:
 *  - progress.ts: stall / drift / loop tracking - when to warn the model and when to give up,
 *  - digest.ts: what each visited page had that matters for the task,
 *  - guards.ts: actions refused before they run (placeholders, made-up URLs, screenshot rationing),
 *  - reflection.ts: the progress check and the final-answer pass,
 *  - context.ts + prompts.ts: what the model is sent.
 *
 * The heuristics are unchanged from desktop. Differences:
 *  - the model is always called with native tool calling (every cloud provider here supports it);
 *    a plain-text JSON action is still accepted as a fallback,
 *  - desktop's borrowed skills (filesystem, rag-memory) do not exist on mobile,
 *  - help requests reach the user through the chat card, the take-over viewer and a notification,
 *  - Android freezes the app shortly after it goes to the background, so a model call that dies
 *    there is retried once the user is back (see #complete).
 */
export default class BrowserAgent {
    readonly id = generateUUID();
    readonly task: string;
    /** Live thumbnail for the chat card - never persisted with the chat */
    onFrame: ((thumbnail: string) => void) | null = null;
    /** The agent is waiting on the user (ask_user / blocker) */
    onNeedsHelp: ((question: string) => void) | null = null;
    session: BrowserSession | null = null;
    /** What the agent is asking the user, while it waits */
    question: string | null = null;
    stopReason: 'user' | 'aborted' | null = null;

    private llm: BrowserAgentLLM;
    private startUrl: string | null;
    private onUpdate: (snapshot: BrowserSessionSnapshot) => void;
    private resume: BrowserAgentResume | null;
    /** What this browser already did in earlier sessions of the chat, oldest first */
    private earlier: EarlierTask[];
    private trace: BrowserTrace;
    private traceSaveTimer: ReturnType<typeof setTimeout> | null = null;

    // The model and what it is offered.
    private contextLimit: number;
    /** Page state budget in characters */
    private maxChars: number;
    private vision: boolean;
    private screenshotsLeft: number;
    private functions: BrowserToolSchema[];
    private estimatedTokens = false;

    // Working memory: the step history, and what survives it being compacted or reset.
    private records: AgentRecord[] = [];
    /** The page state shown while there are no steps yet */
    private initialState = 'The browser is open on a blank page.';
    /** Facts the agent saved via the `note` field of its actions - shown on every turn */
    private notes: string[] = [];
    /** What happened before each context reset (see #resetContext) */
    private progressNotes: string[] = [];
    /** One-line plan from the latest progress check - shown next to the task on every turn */
    private plan: string | null = null;
    private tracker: ProgressTracker;
    private digests = new PageDigests();
    private lastText = '';
    private nudges = 0;
    private nudge: string | null = null;

    // Giving up, progress checks and the final answer.
    private giveUpReason: string | null = null;
    private checkpoints = 0;
    private lastCheckpoint = 0;
    private wentBack = false;
    private doneChecks = 0;

    // Waiting on the user.
    private pendingReply: ((reply: string | null) => void) | null = null;
    /** Blocker on the latest page */
    private lastBlocker: Blocker | null = null;
    /** "host:kind" walls the user already helped with - never pause twice for the same one */
    private acknowledged = new Set<string>();
    private resolveStopped!: (value: { stopped: true }) => void;
    private stopped: Promise<{ stopped: true }>;

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
        this.stopped = new Promise((resolve) => (this.resolveStopped = resolve));

        const from = resume?.from;
        this.earlier = from
            ? [
                ...(from.earlier || []),
                { id: from.id, task: from.task, status: from.status, summary: from.summary, notes: from.notes, userPage: from.userPage },
            ].slice(-MAX_EARLIER_TASKS)
            : [];
        // Pages of the earlier session are fair game - going back to a product it opened is not a made-up URL.
        const earlierPages = from ? `${from.summary || ''} ${from.steps.map((s) => s.url || '').join(' ')} ${from.userPage?.url || ''}` : '';
        this.tracker = new ProgressTracker(task, `${startUrl || ''} ${earlierPages}`);

        this.contextLimit = contextLimit || 8_000;
        // ~15% of the context window per page state (4 chars/token). Capped: on-screen content comes
        // first, and read_page/scroll get the rest.
        this.maxChars = Math.min(Math.max(Math.round(this.contextLimit * 0.6), PAGE_STATE_MIN_CHARS), PAGE_STATE_MAX_CHARS);
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
            earlier: this.earlier.map((e) => ({ id: e.id, task: e.task, status: e.status, summary: e.summary ? clip(e.summary, 1_500) : null })),
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
        return resultForParent(this.trace, this.stopReason);
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
     * storage carry the sign-ins and cart - where that session (or the user) left off.
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

        const reopen = this.resume && !this.startUrl ? resumeUrlOf(this.resume.from) : null;
        const url = this.startUrl || reopen;
        if (!url) return this.#emit();
        const result = await this.session.run('navigate', { url });
        this.initialState = result.state;
        this.lastBlocker = result.blocker || null;
        this.tracker.observe(result);
        this.#recordStep(reopen ? 'resume' : 'navigate', { url }, result);
        this.#emit();
        await this.#pauseForBlocker(result, 0);
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
                this.nudge = NUDGE_TOOL_CALL;
                continue;
            }

            if (call.name === 'done') {
                if (await this.#done(call, step)) return;
                continue;
            }
            await this.#execute(call, step);
            if (this.stopReason) return;
            if (this.trace.tokens.total >= MAX_SESSION_TOKENS)
                this.giveUpReason ??= `I used up this session's budget of ${MAX_SESSION_TOKENS / 1000}k tokens`;
            if (this.giveUpReason) return this.#giveUp(this.giveUpReason);
            if (this.#checkpointDue(step) && (await this.#checkpoint(step))) return;
        }

        // Out of steps - give the model one last chance to report what it found.
        this.nudge = NUDGE_OUT_OF_STEPS;
        const call = await this.#nextCall(CONTROL_TOOLS.filter((t) => t.name === 'done'));
        const draft = call?.name === 'done' ? call.args?.result : this.lastText;
        const { answer } = await this.#finalAnswer(String(draft || ''), { canContinue: false });
        this.#finish('incomplete', answer || 'The browser agent ran out of steps before finishing.');
    }

    /** The model called done. Resolves whether the session ended - the final-answer pass can send it back to work. */
    async #done(call: ToolCall, step: number) {
        const { success = true, result = '' } = call.args || {};
        const { missing, answer } = await this.#finalAnswer(String(result || this.lastText || ''), { canContinue: step < MAX_STEPS - 2 });
        if (this.stopReason) return true;
        if (!missing) {
            this.#finish(success === false || success === 'false' ? 'incomplete' : 'done', answer);
            return true;
        }
        this.records.push({
            call,
            full: `Not finished yet - ${missing}. Keep working on the task, then call done again.${stepTag(step)}`,
            short: `Tried to finish early - missing: ${clip(missing, 120)}`,
            medium: null,
        });
        return false;
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
                this.#trackUsage(messages, response as ICompleteResponse);
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
        let response: ICompleteResponse | null;
        try {
            response = await this.#complete(this.#messages(), functions);
        } catch (error: any) {
            if (this.stopReason || !this.records.at(-1)?.image) throw error;
            // The model turned out not to take images - carry on without screenshots.
            this.log(`Image request failed (${error?.message}) - disabling screenshots`);
            this.#disableScreenshots();
            return this.#nextCall(functions.filter((f) => f.name !== SCREENSHOT_TOOL.name));
        }
        if (!response) return null;
        this.lastText = stripThinking(response.textResponse || '');
        return callFromResponse(response, this.lastText);
    }

    /** Runs one of the model's actions and records what it showed. */
    async #execute(call: ToolCall, step: number) {
        const { name } = call;
        const { note, ...args } = call.args || {};
        const noted = typeof note === 'string' && note.trim() ? this.#saveNote(note) : false;

        const refusal = refusalFor({ name, args }, {
            seenIds: this.tracker.seenIds,
            vision: this.vision,
            screenshotsLeft: this.screenshotsLeft,
            lastAction: this.records.at(-1)?.call?.name ?? null,
        });
        if (refusal) {
            this.records.push({ call, full: `${refusal}${stepTag(step)}`, short: refusal, medium: null });
            this.tracker.refused();
            return;
        }
        if (name === 'screenshot') this.screenshotsLeft--;

        let full: string;
        let short: string;
        let medium: string | null = null;
        let result: ActionResult | null = null;
        let progressed = false;
        let relevant = noted;

        if (name === 'ask_user') {
            const reply = await this.#askUser(String(args.question || 'I need your help to continue.'));
            this.tracker.resetStall();
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
            const seen = this.tracker.observe(result);
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

        const { warning, giveUp } = this.tracker.account({ calls: [...this.records.map((r) => r.call), call], progressed, relevant });
        if (giveUp) this.giveUpReason = giveUp;
        this.records.push({
            call,
            full: `${full}${warning}${stepTag(step)}`,
            short,
            medium,
            image: name === 'screenshot' ? result?.image || null : null,
        });
        if (result && (await this.#pauseForBlocker(result, step))) this.tracker.resetStall();
    }

    /////////////////////////////
    // Progress checks and giving up
    /////////////////////////////

    /** Drifting, just left the most useful page, or due anyway - but never too often. */
    #checkpointDue(step: number) {
        if (step < 5 || this.checkpoints >= MAX_CHECKPOINTS || step - this.lastCheckpoint < 3) return false;
        if (this.tracker.drift >= DRIFT_CHECK) return true;
        // Left a page that really had task content (not just a weekly-ad price) and found nothing since.
        const best = this.digests.best();
        if (best && (best.relevant ?? 0) >= 2 && best.url !== this.digests.currentUrl && this.tracker.drift >= 2) return true;
        return step - this.lastCheckpoint >= CHECK_EVERY;
    }

    /**
     * Asks whether to keep going, answer now, go back to the most useful page, or give up - and
     * does it, within limits: a healthy run is never ended by a check. Resolves whether the session ended.
     */
    async #checkpoint(step: number): Promise<boolean> {
        this.checkpoints++;
        this.lastCheckpoint = step;
        const best = this.digests.best();
        const messages = checkpointMessages({
            ...this.#collected(300),
            steps: this.trace.steps,
            page: this.records.at(-1)?.full || this.initialState,
        });
        let parsed: ReturnType<typeof parseCheckpoint>;
        try {
            const response = await this.#complete(messages, []);
            if (!response) return true;
            parsed = parseCheckpoint(response.textResponse || '');
        } catch (error: any) {
            this.log('Progress check failed:', error?.message);
            return false;
        }
        if (!parsed) return false; // no usable verdict - carry on as before
        let { verdict } = parsed;
        const { reason } = parsed;
        // Giving up needs real signs of being stuck; going back needs somewhere better to go.
        if (verdict === 'GIVE_UP' && !this.tracker.struggling) verdict = 'CONTINUE';
        if (verdict === 'BACK' && (!best || best.url === this.digests.currentUrl)) verdict = 'CONTINUE';
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
            this.tracker.clearDrift();
            return false;
        }
        if (verdict === 'BACK' && best) {
            this.wentBack = true;
            await this.#goBackTo(best, reason, step);
            // Going back is a fresh start; "keep going" does not reset the stall and drift counters.
            this.tracker.resetStall();
        }
        this.plan = reason || this.plan;
        return false;
    }

    /** Takes the agent back to the most useful page after it wandered off. */
    async #goBackTo(best: { url: string; title: string }, reason: string, step: number) {
        const args = { url: best.url };
        const result = await this.session!.run('navigate', args).catch(() => null);
        if (!result) return;
        this.#recordStep('navigate', args, result);
        this.tracker.observe(result);
        this.lastBlocker = result.blocker || null;
        this.records.push({
            call: syntheticCall('navigate', args),
            full: `You had wandered away from the task, so you were taken back to the most useful page so far.${reason ? ` Next: ${reason}` : ''}\n\n${result.outcome}\n\n${result.state}${stepTag(step)}`,
            short: `Taken back to "${clip(best.title, 60)}" after wandering off`,
            medium: null,
        });
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
     * One call over everything collected, since small models write `done` from the last page only.
     * With `canContinue` it may say part of the task is missing (a few times per session).
     */
    async #finalAnswer(draft: string, { canContinue }: { canContinue: boolean }): Promise<{ missing: string | null; answer: string }> {
        const askMissing = canContinue && this.doneChecks < MAX_DONE_CHECKS;
        const messages = finalAnswerMessages({
            ...this.#collected(),
            page: this.records.at(-1)?.full || this.initialState,
            draft,
            askMissing,
        });
        try {
            const response = await this.#complete(messages, []);
            if (!response) return { missing: null, answer: draft };
            const parsed = parseFinalAnswer(response.textResponse || '', { draft, askMissing });
            if (parsed.missing) {
                this.doneChecks++;
                this.log(`Final answer check: not finished - ${parsed.missing}`);
            }
            return parsed;
        } catch (error: any) {
            this.log('Final answer step failed:', error?.message);
            return { missing: null, answer: draft };
        }
    }

    /** Everything the reflection calls are shown */
    #collected(maxEarlierSummary?: number) {
        return {
            task: this.task,
            earlier: earlierSummary(this.earlier, { startUrl: this.startUrl, maxSummary: maxEarlierSummary }),
            notes: notesList(this.notes),
            visited: this.digests.summary({ includeCurrent: true }),
            sent: sentSummary(this.trace.steps),
        };
    }

    /////////////////////////////
    // Waiting on the user
    /////////////////////////////

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

        const question = blockerQuestion(blocker.kind, site);
        this.log(`Paused for ${blocker.kind} on ${site} (score ${blocker.score})`);
        const reply = await this.#askUser(question, blocker);
        if (reply.reset) return true;
        this.records.push({
            call: syntheticCall('ask_user', { question }),
            full: step ? `${reply.full}${stepTag(step)}` : reply.full,
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
        if (page.blocker?.wall) full += `\n\n${STILL_BLOCKED}`;
        return { full, short };
    }

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
        this.progressNotes.push(`${before ? `Steps before: ${before}. ` : ''}Then the user ${what}${said}.`);
        this.records = [];
        this.nudges = 0;
        this.tracker.resetStall();
        this.tracker.observe(page);
        this.initialState = page.state;
        this.lastBlocker = page.blocker || null;
        this.log(`Context reset after the user ${what}`);
    }

    /////////////////////////////
    // What the model is sent
    /////////////////////////////

    #messages() {
        const briefing = taskBriefing({
            task: this.task,
            earlier: earlierSummary(this.earlier, { startUrl: this.startUrl }),
            progress: this.progressNotes,
            notes: this.notes,
            visited: this.digests.summary(),
            plan: this.plan,
            pageState: this.records.length ? null : this.initialState,
        });
        const messages = buildMessages({
            system: systemPrompt({ maxSteps: MAX_STEPS, screenshots: this.vision ? MAX_SCREENSHOTS : 0 }),
            briefing,
            records: this.records,
            contextLimit: this.contextLimit,
            vision: this.vision,
            nudge: this.nudge,
        });
        this.nudge = null;
        return messages;
    }

    /** Resolves whether the note is new */
    #saveNote(note: string) {
        const text = clip(note, 300);
        if (this.notes.includes(text)) return false;
        this.notes.push(text);
        if (this.notes.length > MAX_NOTES) this.notes.shift();
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

    /** Session tokens, from the provider's usage report or an estimate when it sent none. */
    #trackUsage(messages: any[], response: ICompleteResponse) {
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
        if (result.state) this.digests.add(result, this.tracker.termsFor(hostOf(result.page?.url)));
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
            // What the page sent to the site during this step (metadata only, see session/network.ts).
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
}

/** "[Step 3 of 40]" - closes every result so the model knows its budget */
function stepTag(step: number) {
    return `\n\n[Step ${step} of ${MAX_STEPS}]`;
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
