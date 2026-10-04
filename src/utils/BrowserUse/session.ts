import { BrowserNative } from './native';

/**
 * One agent browsing session - a port of the desktop BrowserSession
 * (electron/main/utils/BrowserUse/session.ts). The WebView and its input primitives are native
 * (BrowserUseModule); what each agent action means, how long to wait and what to tell the model
 * about it is decided here, the same way desktop does it.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type PageInfo = { url: string; title: string; favicon: string };

/** `wall` is a confident match (the agent pauses for the user); otherwise the form is merely present. */
export type Blocker = { kind: 'login' | 'captcha' | 'verification'; wall: boolean; score: number };

/** A same-site write request observed during an action. */
export type SentRequest = { label: string; method: string; target: string; status: number | null; ok: boolean | null };

export type ActionResult = {
    ok: boolean;
    /** One line, what happened - kept in the agent's history */
    outcome: string;
    /** The full page state - only the latest is kept in context */
    state: string;
    page: PageInfo;
    /** Small jpeg (base64) for the session trace */
    thumbnail: string | null;
    /** Label of the element acted on */
    target?: string;
    /** The action typed into a password field */
    sensitive?: boolean;
    blocker?: Blocker | null;
    /** The user drove the browser themselves since the agent last looked */
    tookOver?: boolean;
    /** Screenshot action only: small jpeg (base64) for vision models */
    image?: string;
    sent?: SentRequest[];
};

// Analytics, logging and tracking endpoints POST constantly - they are not "the page sent something".
const TRACKING_PATH = /\/(track|tracking|collect|beacon|log|logs|logging|analytics|metrics|telemetry|events?|rum|pixel|ping|sentry|csp-report|li\/track|jot|1p-user-list|pagead)\b/i;
const READ_ONLY_GRAPHQL = /"query"\s*:\s*"\s*(query\b|\{)/;
const ACTIONS_THAT_SUBMIT = new Set(['click', 'press_key', 'type', 'select_option']);

// Screenshots are a last resort for vision models, so keep them small. A phone screen is tall,
// so they are narrower than desktop's.
const SCREENSHOT_WIDTH = 540;
const SCREENSHOT_QUALITY = 50;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_QUALITY = 45;

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

type NetEntry = { at: number; method: string; url: string; body: string; status: number | null; ok: boolean | null };

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
    // Page access
    /////////////////////////////

    private page<T = any>(call: string): Promise<T> {
        return BrowserNative.page<T>(this.id, call);
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

    /////////////////////////////
    // Network ("was it really sent?")
    /////////////////////////////

    /** Same-site write requests since `mark` (page clock), after giving in-flight ones up to 2s to come back. */
    private async collectSent(mark: number | null): Promise<SentRequest[]> {
        if (mark === null) return [];
        let pageUrl = '';
        let entries: NetEntry[] = [];
        const started = Date.now();
        do {
            entries = (await this.page<NetEntry[] | null>(`window.__bu.netSince(${mark})`).catch(() => null)) || [];
            if (!entries.some((r) => r.ok === null && r.method !== 'WS')) break;
            await sleep(150);
        } while (Date.now() - started < 2_000);
        pageUrl = (await BrowserNative.status(this.id).catch(() => null))?.url || '';

        const sent = new Map<string, SentRequest>();
        for (const entry of entries) {
            let url: URL;
            try { url = new URL(entry.url); } catch { continue; }
            if (!sameSite(url.hostname, pageUrl) || TRACKING_PATH.test(url.pathname)) continue;
            if (entry.method === 'WS') {
                sent.set(`ws:${url.host}`, { label: 'websocket message', method: 'WS', target: url.host, status: null, ok: true });
                continue;
            }
            if (READ_ONLY_GRAPHQL.test(entry.body || '')) continue; // GraphQL reads sent as POST
            const operation = (entry.body || '').match(/"operationName"\s*:\s*"([\w-]{2,60})"/)?.[1] || null;
            sent.set(`${entry.at}:${entry.method}:${entry.url}`, {
                label: operation || lastSegment(url),
                method: entry.method,
                target: shortTarget(url),
                status: entry.status,
                ok: entry.ok,
            });
        }
        return [...sent.values()];
    }

    /////////////////////////////
    // Actions
    /////////////////////////////

    private async tapElement(target: { x: number; y: number; vw: number }) {
        await BrowserNative.tap(this.id, target.x, target.y, target.vw);
    }

    /** Run one agent action and return its outcome with the fresh page state. */
    async run(tool: string, args: Record<string, any> = {}): Promise<ActionResult> {
        const mark = ACTIONS_THAT_SUBMIT.has(tool) ? await this.page<number>('window.__bu.netMark()').catch(() => null) : null;
        let outcome = '';
        let ok = true;
        let sensitive = false;
        let label = '';
        let requested: string | null = null;
        try {
            switch (tool) {
                case 'navigate': {
                    const url = normalizeUrl(args.url);
                    if (!url) throw new Error(`"${args.url}" is not a valid web address.`);
                    requested = url;
                    await BrowserNative.navigate(this.id, url);
                    outcome = `Opened ${url}`;
                    break;
                }
                case 'click': {
                    const target = await this.page(`window.__bu.locate(${Number(args.id)})`);
                    if (target.error) throw new Error(target.error);
                    const before = await this.page<string>('window.__bu.fingerprint()').catch(() => '');
                    await sleep(60);
                    await this.tapElement(target);
                    label = target.label;
                    outcome = `Clicked [${args.id}] ${target.tag} "${target.label}"`;
                    await this.settle();
                    const after = await this.page<string>('window.__bu.fingerprint()').catch(() => '');
                    if (before && before === after) outcome += ' - but nothing on the page changed';
                    break;
                }
                case 'type': {
                    const id = args.id === undefined || args.id === null || args.id === '' ? 0 : Number(args.id);
                    if (Number.isNaN(id)) throw new Error(`"${args.id}" is not an element id from the page state.`);
                    if (id) {
                        const target = await this.page(`window.__bu.locate(${id})`);
                        if (target.error) throw new Error(target.error);
                        if (target.isSelect) throw new Error(`[${id}] is a dropdown. Use select_option instead.`);
                        label = target.label;
                        await this.tapElement(target);
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
                    sensitive = !!check.password;
                    if (!check.ok) {
                        const hint = await this.page<string>('window.__bu.textFieldHint()').catch(() => '');
                        throw new Error(`The text did not go into ${id ? `[${id}]` : 'the field'} - ${check.reason}. Nothing was typed. ${hint}`);
                    }
                    if (args.submit) {
                        await sleep(100);
                        await this.page('window.__bu.pressKey("Enter")');
                    }
                    const where = check.field ? `the "${check.field}" field` : id ? `[${id}]` : 'the focused field';
                    outcome = `Typed into ${where}${sensitive ? ' (password field)' : ` - it now reads "${check.value}"`}${args.submit ? ' and pressed Enter' : ''}`;
                    break;
                }
                case 'select_option': {
                    const result = await this.page(`window.__bu.selectOption(${Number(args.id)}, ${JSON.stringify(String(args.option ?? ''))})`);
                    if (result.error) throw new Error(result.error);
                    label = result.selected;
                    outcome = `Selected "${result.selected}" in [${args.id}]`;
                    break;
                }
                case 'press_key': {
                    const result = await this.page(`window.__bu.pressKey(${JSON.stringify(String(args.key || 'Enter'))})`);
                    if (result?.error) throw new Error(result.error);
                    outcome = `Pressed ${result?.key || args.key}`;
                    break;
                }
                case 'scroll': {
                    const down = args.direction !== 'up';
                    const amount = Math.min(Math.max(Number(args.amount) || 600, 100), 3000);
                    const target = await this.page(`window.__bu.scrollTarget(${Number(args.id) || 0})`);
                    // A real drag over the thing that should move; JS scroll as a fallback when the page ignores it.
                    await BrowserNative.drag(this.id, target.x, target.y, down ? amount : -amount, target.vw);
                    await sleep(350);
                    let pos = await this.page<number>('window.__bu.scrollPos()');
                    if (pos === target.pos) pos = await this.page<number>(`window.__bu.scrollByJs(${down ? amount : -amount})`);
                    const where = target.panel ? ` the "${target.panel}" panel` : '';
                    outcome = pos === target.pos
                        ? `Scrolled ${down ? 'down' : 'up'}${where} - but nothing moved (already at the ${down ? 'bottom' : 'top'}?)`
                        : `Scrolled ${down ? 'down' : 'up'}${where}`;
                    break;
                }
                case 'go_back': {
                    const went = await BrowserNative.history(this.id, 'back');
                    if (!went) throw new Error('There is no previous page to go back to.');
                    outcome = 'Went back to the previous page';
                    break;
                }
                case 'wait': {
                    const seconds = Math.min(Math.max(Number(args.seconds) || 2, 1), 10);
                    await sleep(seconds * 1000);
                    outcome = `Waited ${seconds}s`;
                    break;
                }
                case 'read_page': {
                    const ids = Array.isArray(args.text_ids) ? args.text_ids.map(Number).filter(Boolean) : [];
                    const text = await this.page<string>(`window.__bu.read(${JSON.stringify(ids)}, ${Math.round(this.maxChars * 0.9)})`);
                    return { ok: true, outcome: `Read ${ids.length ? `text ${ids.map((i: number) => `T${i}`).join(', ')}` : 'the page'}`, state: text || '', page: await this.info(), thumbnail: null };
                }
                case 'state':
                    outcome = 'Looked at the page';
                    break;
                case 'screenshot': {
                    const image = await BrowserNative.capture(this.id, SCREENSHOT_WIDTH, SCREENSHOT_QUALITY);
                    if (!image) throw new Error('The screen could not be captured.');
                    const { text, blocker } = await this.state();
                    return { ok: true, outcome: 'Took a screenshot', image, blocker, state: text, page: await this.info(), thumbnail: await this.thumbnail() };
                }
                default:
                    throw new Error(`Unknown browser action "${tool}".`);
            }
        } catch (error: any) {
            ok = false;
            outcome = `Failed: ${error?.message || error}`;
        }

        if (!['wait', 'state', 'click'].includes(tool)) await this.settle(); // click settles itself
        const sent = await this.collectSent(mark);
        if (sent.length) outcome += `\nSent to the site: ${describeSent(sent)}`;
        else if (ok && (tool === 'click' || tool === 'press_key' || (tool === 'type' && args.submit))) outcome += '\nNothing was sent to the site.';
        const page = await this.info();
        // Asking for one page and landing on another is a strong sign of a sign-in redirect.
        const { text, blocker } = await this.state({ redirected: !!requested && bouncedAway(requested, page.url) });
        const tookOver = this.tookOverSinceRead;
        this.tookOverSinceRead = false;
        return { ok, outcome, target: label, sensitive, blocker, tookOver, sent, state: text, page, thumbnail: await this.thumbnail() };
    }
}

/** Same site = same last two host labels (x.com / api.x.com, www.linkedin.com / linkedin.com). */
function sameSite(host: string, pageUrl: string) {
    try {
        const tail = (h: string) => h.split('.').slice(-2).join('.');
        return tail(host) === tail(new URL(pageUrl).hostname);
    } catch {
        return false;
    }
}

/** host + path with ids/hashes collapsed, e.g. x.com/i/api/graphql/…/CreateTweet */
function shortTarget(url: URL) {
    const path = url.pathname
        .split('/')
        .map((part) => (isOpaqueId(part) ? '…' : part))
        .join('/');
    const text = `${url.host.replace(/^www\./, '')}${path}`;
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

// Ids, hashes and tokens in a path say nothing to the model - collapse them.
function isOpaqueId(part: string) {
    if (part.length > 24 || /^[0-9a-f-]{12,}$/i.test(part) || /^\d{5,}$/.test(part)) return true;
    return part.length >= 16 && /\d/.test(part) && /[a-z]/i.test(part);
}

function lastSegment(url: URL) {
    const parts = url.pathname.split('/').filter((p) => p && p.length <= 40 && !/^\d+$/.test(p));
    return parts.at(-1) || url.host;
}

function describeSent(sent: SentRequest[]) {
    const status = (r: SentRequest) => (r.method === 'WS' ? 'sent' : r.status ? `${r.status}${r.ok ? ' OK' : ' (failed)'}` : r.ok === false ? 'failed' : 'no reply yet');
    const shown = sent.slice(0, 3).map((r) => (r.method === 'WS' ? `a websocket message on ${r.target}` : `${r.method} ${r.target}${r.label !== lastSegmentOf(r.target) ? ` (${r.label})` : ''} -> ${status(r)}`));
    return shown.join('; ') + (sent.length > 3 ? `; and ${sent.length - 3} more` : '');
}

function lastSegmentOf(target: string) {
    return target.split('/').filter(Boolean).at(-1) || '';
}

/**
 * Asked for a specific page and ended up somewhere else (x.com/home -> x.com/i/flow/login).
 * Homepages are ignored since they legitimately redirect (regional domains, locales).
 */
export function bouncedAway(requested: string, landed: string) {
    try {
        const [from, to] = [new URL(requested), new URL(landed)];
        const path = (u: URL) => u.pathname.replace(/\/$/, '');
        if (!path(from)) return false;
        return path(from) !== path(to);
    } catch {
        return false;
    }
}

export function normalizeUrl(input: string) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(withScheme);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
}
