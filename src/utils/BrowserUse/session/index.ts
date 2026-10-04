import { BrowserNative } from '../native';
import { SCREENSHOT_QUALITY, SCREENSHOT_WIDTH, THUMBNAIL_QUALITY, THUMBNAIL_WIDTH } from '../constants';
import { sleep } from '../text';
import { bouncedAway, normalizeUrl } from '../urls';
import { type ActionResult, type Blocker, type PageInfo, type SentRequest } from '../types';
import { describeSent, sentRequests, type NetEntry } from './network';

/**
 * One agent browsing session - a port of the desktop BrowserSession
 * (electron/main/utils/BrowserUse/session.ts). The WebView and its input primitives are native
 * (BrowserUseModule); what each agent action means, how long to wait and what to tell the model
 * about it is decided here, the same way desktop does it.
 *
 * Every action ends the same way (see `run`): wait for the page to settle, note what it sent to
 * the site, and return the fresh page state.
 */

/** Actions that can make the page send something - only these watch the network */
const ACTIONS_THAT_SUBMIT = new Set(['click', 'press_key', 'type', 'select_option']);

/** Told to the model with the page state when a sign-in, captcha or code form is on the page */
const BLOCKER_NOTICE: Record<Blocker['kind'], { wall: string; present: string }> = {
    login: {
        wall: 'STOP: this is a sign-in page. Do not type anything or look for a way around it - call ask_user.',
        present: 'This page has a sign-in form, but its content may still be available. Only if the task really needs you to be signed in, call ask_user. Never sign in yourself unless the user gave you the credentials for this task.',
    },
    captcha: {
        wall: 'STOP: this page is a captcha / "are you human" check. Do not try to solve it - call ask_user.',
        present: 'This page contains a captcha. If you need to get past it, call ask_user - never try to solve it yourself.',
    },
    verification: {
        wall: 'STOP: this page asks for a verification code. Do not guess it - call ask_user.',
        present: 'This page has a verification code field. If it must be filled in, call ask_user for the code.',
    },
};

/**
 * What an action did, filled in as it goes - so a failure halfway still reports what it got to
 * (the field it typed into, that it was a password field).
 */
type Performed = { outcome: string; target: string; sensitive: boolean; requested: string | null };

export default class BrowserSession {
    readonly id: string;
    profileId: string;
    profileName: string;
    private maxChars: number;
    private takenOver = false;
    private tookOverSinceRead = false;
    private closed = false;

    private constructor(id: string, profileId: string, profileName: string, maxChars: number) {
        this.id = id;
        this.profileId = profileId;
        this.profileName = profileName;
        this.maxChars = maxChars;
    }

    /** `profileId` wins over `profile` (a name) when both are given */
    static async create({ id, profileId = null, profile, maxChars = 8000 }: { id: string; profileId?: string | null; profile: string | null; maxChars?: number }) {
        const started = await BrowserNative.start({ sessionId: id, profileId, profileName: profile });
        return new BrowserSession(id, started.profileId, started.profileName, maxChars);
    }

    /** The user opened the WebView to drive it themselves (sign in, solve a captcha...). */
    takeOver() {
        this.takenOver = true;
        this.tookOverSinceRead = true;
    }

    handBack() {
        this.takenOver = false;
    }

    get isTakenOver() {
        return this.takenOver;
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        await BrowserNative.close(this.id).catch(() => { });
    }

    /////////////////////////////
    // Running an action
    /////////////////////////////

    /** Run one agent action and return its outcome with the fresh page state. */
    async run(tool: string, args: Record<string, any> = {}): Promise<ActionResult> {
        const mark = ACTIONS_THAT_SUBMIT.has(tool) ? await this.page<number>('window.__bu.netMark()').catch(() => null) : null;
        const done: Performed = { outcome: '', target: '', sensitive: false, requested: null };
        let ok = true;
        try {
            // read_page and screenshot return their own complete result.
            const complete = await this.perform(tool, args, done);
            if (complete) return complete;
        } catch (error: any) {
            ok = false;
            done.outcome = `Failed: ${error?.message || error}`;
        }

        if (!['wait', 'state', 'click'].includes(tool)) await this.settle(); // click settles itself
        const sent = await this.collectSent(mark);
        let outcome = done.outcome;
        if (sent.length) outcome += `\nSent to the site: ${describeSent(sent)}`;
        else if (ok && (tool === 'click' || tool === 'press_key' || (tool === 'type' && args.submit))) outcome += '\nNothing was sent to the site.';
        const page = await this.info();
        const { text, blocker } = await this.state({ redirected: !!done.requested && bouncedAway(done.requested, page.url) });
        const tookOver = this.tookOverSinceRead;
        this.tookOverSinceRead = false;
        return { ok, outcome, target: done.target, sensitive: done.sensitive, blocker, tookOver, sent, state: text, page, thumbnail: await this.thumbnail() };
    }

    private perform(tool: string, args: Record<string, any>, done: Performed): Promise<ActionResult | void> {
        switch (tool) {
            case 'navigate': return this.navigate(args, done);
            case 'click': return this.click(args, done);
            case 'type': return this.type(args, done);
            case 'select_option': return this.selectOption(args, done);
            case 'press_key': return this.pressKey(args, done);
            case 'scroll': return this.scroll(args, done);
            case 'go_back': return this.goBack(done);
            case 'wait': return this.wait(args, done);
            case 'read_page': return this.readPage(args);
            case 'screenshot': return this.screenshot();
            case 'state':
                done.outcome = 'Looked at the page';
                return Promise.resolve();
            default:
                throw new Error(`Unknown browser action "${tool}".`);
        }
    }

    /////////////////////////////
    // Actions
    /////////////////////////////

    private async navigate(args: Record<string, any>, done: Performed) {
        const url = normalizeUrl(args.url);
        if (!url) throw new Error(`"${args.url}" is not a valid web address.`);
        done.requested = url;
        await BrowserNative.navigate(this.id, url);
        done.outcome = `Opened ${url}`;
    }

    private async click(args: Record<string, any>, done: Performed) {
        const target = await this.locate(args.id);
        const before = await this.page<string>('window.__bu.fingerprint()').catch(() => '');
        await sleep(60);
        await this.tap(target);
        done.target = target.label;
        done.outcome = `Clicked [${args.id}] ${target.tag} "${target.label}"`;
        await this.settle();
        const after = await this.page<string>('window.__bu.fingerprint()').catch(() => '');
        if (before && before === after) done.outcome += ' - but nothing on the page changed';
    }

    /** Types into element `id`, or into whatever has focus when there is no id. */
    private async type(args: Record<string, any>, done: Performed) {
        const id = args.id === undefined || args.id === null || args.id === '' ? 0 : Number(args.id);
        if (Number.isNaN(id)) throw new Error(`"${args.id}" is not an element id from the page state.`);
        if (id) {
            const target = await this.locate(id);
            if (target.isSelect) throw new Error(`[${id}] is a dropdown. Use select_option instead.`);
            done.target = target.label;
            await this.tap(target);
            // Tapping something that is not a field ("Start a post") usually opens the real editor.
            if (!target.editable) await this.settle(4_000);
            else await sleep(80);
        }
        const text = String(args.text ?? '');
        const prep = await this.page(`window.__bu.prepareType(${id}, ${args.clear !== false})`);
        if (prep.error) throw new Error(prep.error);
        const inserted = await this.page(`window.__bu.insertText(${JSON.stringify(text)})`);
        if (inserted?.error) throw new Error(inserted.error);
        await sleep(120);
        const check = await this.page(`window.__bu.typedInto(${id}, ${JSON.stringify(text)})`);
        done.sensitive = !!check.password;
        if (!check.ok) {
            const hint = await this.page<string>('window.__bu.textFieldHint()').catch(() => '');
            throw new Error(`The text did not go into ${id ? `[${id}]` : 'the field'} - ${check.reason}. Nothing was typed. ${hint}`);
        }
        if (args.submit) {
            await sleep(100);
            await this.page('window.__bu.pressKey("Enter")');
        }
        const where = check.field ? `the "${check.field}" field` : id ? `[${id}]` : 'the focused field';
        const value = done.sensitive ? ' (password field)' : ` - it now reads "${check.value}"`;
        done.outcome = `Typed into ${where}${value}${args.submit ? ' and pressed Enter' : ''}`;
    }

    private async selectOption(args: Record<string, any>, done: Performed) {
        const result = await this.page(`window.__bu.selectOption(${Number(args.id)}, ${JSON.stringify(String(args.option ?? ''))})`);
        if (result.error) throw new Error(result.error);
        done.target = result.selected;
        done.outcome = `Selected "${result.selected}" in [${args.id}]`;
    }

    private async pressKey(args: Record<string, any>, done: Performed) {
        const result = await this.page(`window.__bu.pressKey(${JSON.stringify(String(args.key || 'Enter'))})`);
        if (result?.error) throw new Error(result.error);
        done.outcome = `Pressed ${result?.key || args.key}`;
    }

    /** A real drag over the thing that should move; JS scrolling as a fallback when the page ignores it. */
    private async scroll(args: Record<string, any>, done: Performed) {
        const down = args.direction !== 'up';
        const amount = Math.min(Math.max(Number(args.amount) || 600, 100), 3000);
        const delta = down ? amount : -amount;
        const target = await this.page(`window.__bu.scrollTarget(${Number(args.id) || 0})`);
        await BrowserNative.drag(this.id, target.x, target.y, delta, target.vw);
        await sleep(350);
        let pos = await this.page<number>('window.__bu.scrollPos()');
        if (pos === target.pos) pos = await this.page<number>(`window.__bu.scrollByJs(${delta})`);
        const where = target.panel ? ` the "${target.panel}" panel` : '';
        const direction = down ? 'down' : 'up';
        done.outcome = pos === target.pos
            ? `Scrolled ${direction}${where} - but nothing moved (already at the ${down ? 'bottom' : 'top'}?)`
            : `Scrolled ${direction}${where}`;
    }

    private async goBack(done: Performed) {
        const went = await BrowserNative.history(this.id, 'back');
        if (!went) throw new Error('There is no previous page to go back to.');
        done.outcome = 'Went back to the previous page';
    }

    private async wait(args: Record<string, any>, done: Performed) {
        const seconds = Math.min(Math.max(Number(args.seconds) || 2, 1), 10);
        await sleep(seconds * 1000);
        done.outcome = `Waited ${seconds}s`;
    }

    /** The text itself is the "page state" - nothing changed on the page, so there is nothing to settle. */
    private async readPage(args: Record<string, any>): Promise<ActionResult> {
        const ids = Array.isArray(args.text_ids) ? args.text_ids.map(Number).filter(Boolean) : [];
        const text = await this.page<string>(`window.__bu.read(${JSON.stringify(ids)}, ${Math.round(this.maxChars * 0.9)})`);
        const what = ids.length ? `text ${ids.map((i: number) => `T${i}`).join(', ')}` : 'the page';
        return { ok: true, outcome: `Read ${what}`, state: text || '', page: await this.info(), thumbnail: null };
    }

    private async screenshot(): Promise<ActionResult> {
        const image = await BrowserNative.capture(this.id, SCREENSHOT_WIDTH, SCREENSHOT_QUALITY);
        if (!image) throw new Error('The screen could not be captured.');
        const { text, blocker } = await this.state();
        return { ok: true, outcome: 'Took a screenshot', image, blocker, state: text, page: await this.info(), thumbnail: await this.thumbnail() };
    }

    /////////////////////////////
    // Page access
    /////////////////////////////

    private page<T = any>(call: string): Promise<T> {
        return BrowserNative.page<T>(this.id, call);
    }

    /** Where element [id] is on screen, for a native tap */
    private async locate(id: unknown) {
        const target = await this.page(`window.__bu.locate(${Number(id)})`);
        if (target.error) throw new Error(target.error);
        return target;
    }

    private async tap(target: { x: number; y: number; vw: number }) {
        await BrowserNative.tap(this.id, target.x, target.y, target.vw);
    }

    private async info(): Promise<PageInfo> {
        const [status, favicon] = await Promise.all([
            BrowserNative.status(this.id).catch(() => null),
            this.page<string>('window.__bu.favicon()').catch(() => ''),
        ]);
        return { url: status?.url || '', title: status?.title || '', favicon: favicon || '' };
    }

    /** The token-light page representation handed to the LLM after every action. */
    async state(hints: { redirected?: boolean } = {}): Promise<{ text: string; blocker: Blocker | null }> {
        const snap = await this.page<any>(`window.__bu.snapshot(${JSON.stringify({ maxChars: this.maxChars, hints })})`).catch(() => null);
        if (!snap) {
            const status = await BrowserNative.status(this.id).catch(() => null);
            if (status?.crashed) throw new Error('The browser page crashed (the phone ran low on memory).');
            return { text: `URL: ${status?.url || ''}\nThe page could not be read (it may still be loading). Try wait or navigate again.`, blocker: null };
        }
        const lines = [
            `URL: ${snap.url}`,
            `Title: ${snap.title}`,
            `Scroll: ${snap.scrollY}/${snap.maxScrollY}px`,
            '',
            ...(snap.lines.length ? snap.lines : ['(no visible content)']),
        ];
        if (snap.truncated || snap.belowFold)
            lines.push(`(${snap.truncated + snap.belowFold} more items further down - scroll down or use read_page to see them)`);
        const notices = await BrowserNative.takeNotices(this.id).catch(() => [] as string[]);
        const blocker: Blocker | null = snap.blocker || null;
        if (blocker) notices.unshift(BLOCKER_NOTICE[blocker.kind][blocker.wall ? 'wall' : 'present']);
        if (notices.length) lines.push('', 'Notices:', ...notices.map((n) => `- ${n}`));
        return { text: lines.join('\n'), blocker };
    }

    /**
     * Wait for any navigation to finish and the DOM to stop changing. Single-page apps (X, LinkedIn)
     * keep rendering long after "loaded", so the DOM must hold still for ~0.5s and not be a bare shell.
     */
    private async settle(maxMs = 10_000) {
        await sleep(200);
        const started = Date.now();
        while (Date.now() - started < maxMs) {
            const status = await BrowserNative.status(this.id).catch(() => null);
            if (!status?.loading) break;
            await sleep(150);
        }
        let last = -1;
        let stable = 0;
        for (let i = 0; i < 20; i++) {
            const size = await this.page<number>('window.__bu.domSize()').catch(() => -1);
            stable = size === last ? stable + 1 : 0;
            if (stable >= 2 && size > 1_000) break;
            last = size;
            await sleep(250);
        }
    }

    async thumbnail(): Promise<string | null> {
        return BrowserNative.capture(this.id, THUMBNAIL_WIDTH, THUMBNAIL_QUALITY).catch(() => null);
    }

    /** What the page sent to the site since `mark` (page clock), after giving in-flight requests up to 2s to come back. */
    private async collectSent(mark: number | null): Promise<SentRequest[]> {
        if (mark === null) return [];
        let entries: NetEntry[] = [];
        const started = Date.now();
        do {
            entries = (await this.page<NetEntry[] | null>(`window.__bu.netSince(${mark})`).catch(() => null)) || [];
            if (!entries.some((r) => r.ok === null && r.method !== 'WS')) break;
            await sleep(150);
        } while (Date.now() - started < 2_000);
        const pageUrl = (await BrowserNative.status(this.id).catch(() => null))?.url || '';
        return sentRequests(entries, pageUrl);
    }
}
