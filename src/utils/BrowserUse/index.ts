import { useEffect, useState, useSyncExternalStore } from 'react';
import { generateUUID } from '@/utils/constants';
import type BrowserAgent from './agent';
import HelpNotifications from './helpNotifications';
import { BrowserNative, type BrowserCapabilities } from './native';
import { normalizeUrl } from './urls';
import BrowserTraces from './traces';

/**
 * In-app hub for the browser agent ("Browser Use"): the live agent sessions, their latest
 * thumbnails, their "needs your help" notifications (./helpNotifications.ts) and the full-screen
 * viewer the user watches, takes over or browses a session in.
 *
 * The agent itself runs inside the browser_use tool call (see ToolsManager/tools/browserUse); the
 * chat card and viewer talk to it through here, the way the desktop frontend sends
 * `browserUseControl` messages over the agent websocket.
 */

export type ViewerMode = 'watch' | 'takeover' | 'browse';
export type ViewerState = {
    sessionId: string;
    mode: ViewerMode;
    profileName?: string;
    /** Browse opened from a finished session's card - where the user leaves it is saved for a follow-up */
    fromSession?: string;
} | null;

type Listener = () => void;

class BrowserUseManager {
    private agents = new Map<string, BrowserAgent>();
    private frames = new Map<string, string>();
    private viewer: ViewerState = null;
    private listeners = new Set<Listener>();
    private version = 0;
    private capabilities: BrowserCapabilities | null = null;
    private help = new HelpNotifications(() =>
        [...this.agents.values()]
            .filter((agent) => agent.isWaitingForUser && agent.question)
            .map((agent) => ({ sessionId: agent.id, question: agent.question! })),
    );

    private changed() {
        this.version++;
        for (const listener of this.listeners) {
            try { listener(); } catch { }
        }
    }

    subscribe = (listener: Listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getVersion = () => this.version;

    async getCapabilities(refresh = false): Promise<BrowserCapabilities> {
        if (!this.capabilities || refresh) this.capabilities = await BrowserNative.capabilities();
        return this.capabilities;
    }

    /////////////////////////////
    // Agent sessions
    /////////////////////////////

    register(agent: BrowserAgent) {
        this.agents.set(agent.id, agent);
        agent.onFrame = (thumbnail) => {
            this.frames.set(agent.id, thumbnail);
            this.changed();
        };
        agent.onNeedsHelp = (question) => {
            this.changed();
            // The user may have locked the phone or be in another app waiting for the agent - bring them back.
            this.help.asked(agent.id, question);
        };
        this.changed();
    }

    unregister(agent: BrowserAgent) {
        this.help.clear(agent.id);
        this.agents.delete(agent.id);
        this.frames.delete(agent.id);
        if (this.viewer?.sessionId === agent.id) this.viewer = null;
        this.changed();
    }

    agent(sessionId: string | null | undefined) {
        return sessionId ? this.agents.get(sessionId) ?? null : null;
    }

    isLive(sessionId: string) {
        return this.agents.has(sessionId);
    }

    frame(sessionId: string) {
        return this.frames.get(sessionId) ?? null;
    }

    stop(sessionId: string) {
        this.agents.get(sessionId)?.stop('user');
    }

    /** Answers the agent's question. An empty reply means "I did it, carry on". */
    reply(sessionId: string, text?: string | null) {
        const agent = this.agents.get(sessionId);
        if (!agent) return false;
        if (this.viewer?.sessionId === sessionId) this.viewer = null;
        this.help.clear(sessionId);
        const answered = agent.reply(text);
        this.changed();
        return answered;
    }

    /////////////////////////////
    // Viewer
    /////////////////////////////

    get viewerState(): ViewerState {
        return this.viewer;
    }

    /** Watch the agent work, or take over the page when it asked for help. */
    openViewer(sessionId: string, mode: 'watch' | 'takeover') {
        const agent = this.agents.get(sessionId);
        if (!agent?.session) return;
        if (mode === 'takeover') agent.session.takeOver();
        this.viewer = { sessionId, mode, profileName: agent.session.profileName };
        this.changed();
    }

    closeViewer() {
        const viewer = this.viewer;
        if (!viewer) return;
        this.viewer = null;
        if (viewer.mode === 'browse') this.closeBrowse(viewer);
        this.changed();
    }

    /**
     * Opens the in-app browser on a profile for the user to use themselves: signing in to a site
     * before the agent needs it, or picking up where a finished session left off (the cart it
     * filled, the form it drafted). Agent profiles have their own cookies, so this is the only
     * browser that sees those sign-ins - Chrome does not. Not an agent session: nothing drives it
     * and it closes with the viewer. Settings pass the profile's id; session cards its name.
     */
    async openBrowser({ profileId = null, profileName = null, url, fromSession }: { profileId?: string | null; profileName?: string | null; url: string; fromSession?: string }) {
        // A finished session opens where the user last left it, if they already looked at it.
        const left = fromSession ? (await BrowserTraces.get(fromSession).catch(() => null))?.userPage?.url : null;
        const target = normalizeUrl(left || url);
        if (!target) throw new Error('invalid_url');
        if (this.viewer?.mode === 'browse') this.closeViewer();
        const sessionId = generateUUID();
        const profile = await BrowserNative.start({ sessionId, profileId, profileName });
        await BrowserNative.navigate(sessionId, target);
        this.viewer = { sessionId, mode: 'browse', profileName: profile.profileName, fromSession };
        this.changed();
    }

    /**
     * Closes a browse viewer's WebView. Opened from a finished session, the page the user leaves
     * it on is saved with that session first: a follow-up in the chat ("check out", "use the other
     * size") is usually about what they were just looking at, so it starts there.
     */
    private async closeBrowse(viewer: NonNullable<ViewerState>) {
        try {
            if (viewer.fromSession) {
                const status = await BrowserNative.status(viewer.sessionId).catch(() => null);
                if (status?.url && /^https?:/i.test(status.url) && !status.crashed)
                    await BrowserTraces.setUserPage(viewer.fromSession, { url: status.url, title: status.title });
            }
        } finally {
            await BrowserNative.close(viewer.sessionId).catch(() => { });
        }
    }
}

const BrowserUse = new BrowserUseManager();
export default BrowserUse;

/** Re-renders whenever a session, frame or the viewer changes */
export function useBrowserUse() {
    useSyncExternalStore(BrowserUse.subscribe, BrowserUse.getVersion);
    return BrowserUse;
}

export function useBrowserCapabilities() {
    const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
    useEffect(() => {
        let cancelled = false;
        BrowserUse.getCapabilities(true)
            .then((value) => { if (!cancelled) setCapabilities(value); })
            .catch(() => { if (!cancelled) setCapabilities({ multiProfile: false, documentStartScript: false, available: false }); });
        return () => { cancelled = true; };
    }, []);
    return capabilities;
}
