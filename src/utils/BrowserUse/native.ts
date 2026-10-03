import { NativeEventEmitter, NativeModules, Platform, requireNativeComponent, type ViewProps } from 'react-native';
import { INIT_SCRIPT, PAGE_SCRIPT } from './pageScript';

/**
 * Typed wrapper around the native BrowserUseModule (android/.../browseruse). The native side owns
 * the WebViews and profiles; everything that decides *what* to do lives in JS.
 */

export type BrowserCapabilities = {
    /** androidx.webkit MULTI_PROFILE - more than one browser profile (separate cookie jars) */
    multiProfile: boolean;
    /** Scripts can run before the page's own (passkey block, request recording) */
    documentStartScript: boolean;
    /** The main app is in front - the assistant overlay and quick actions have no browser */
    available: boolean;
};

export type BrowserProfile = {
    id: string;
    name: string;
    createdAt: number;
    isDefault: boolean;
    siteCount: number;
    /** A session is open on it - it cannot be cleared or deleted right now */
    inUse: boolean;
};

export type BrowserProfileSite = {
    host: string;
    lastVisited: number;
    cookieCount: number;
    /** Cookie names only - values never leave native code */
    cookies: string[];
};

export type BrowserStatus = {
    url: string | null;
    title: string | null;
    loading: boolean;
    progress: number;
    canGoBack: boolean;
    canGoForward: boolean;
    crashed: boolean;
};

export type BrowserStatusEvent = BrowserStatus & { sessionId: string };

type NativeBrowserUse = {
    capabilities(): Promise<BrowserCapabilities>;
    setScripts(page: string, init: string): Promise<boolean>;
    listProfiles(): Promise<string>;
    createProfile(name: string): Promise<string>;
    renameProfile(id: string, name: string): Promise<boolean>;
    deleteProfile(id: string): Promise<boolean>;
    clearProfile(id: string): Promise<boolean>;
    profileSites(id: string): Promise<string>;
    forgetSite(id: string, site: string): Promise<boolean>;
    start(sessionId: string, profileId: string | null, profileName: string | null): Promise<{ profileId: string; profileName: string }>;
    close(sessionId: string): Promise<boolean>;
    navigate(sessionId: string, url: string): Promise<boolean>;
    history(sessionId: string, action: 'back' | 'forward' | 'reload' | 'stop'): Promise<boolean>;
    status(sessionId: string): Promise<BrowserStatus>;
    page(sessionId: string, call: string): Promise<string | null>;
    tap(sessionId: string, x: number, y: number, viewportWidth: number): Promise<boolean>;
    drag(sessionId: string, x: number, y: number, deltaCss: number, viewportWidth: number): Promise<boolean>;
    capture(sessionId: string, width: number, quality: number): Promise<string | null>;
    takeNotices(sessionId: string): Promise<string[]>;
    addNotice(sessionId: string, text: string): Promise<boolean>;
};

const Native: NativeBrowserUse | undefined = Platform.OS === 'android' ? NativeModules.BrowserUseModule : undefined;

/** Whether this build has the native browser at all (Android only) */
export const hasNativeBrowser = !!Native;

function native(): NativeBrowserUse {
    if (!Native) throw new Error('The browser agent is only available on Android.');
    return Native;
}

let scriptsReady: Promise<boolean> | null = null;
/** Hands the page + document-start scripts to native once per JS load (they are kept there, not re-sent per call). */
function ensureScripts() {
    if (!scriptsReady) scriptsReady = native().setScripts(PAGE_SCRIPT, INIT_SCRIPT).catch((error) => {
        scriptsReady = null;
        throw error;
    });
    return scriptsReady;
}

export const BrowserNative = {
    async capabilities(): Promise<BrowserCapabilities> {
        if (!Native) return { multiProfile: false, documentStartScript: false, available: false };
        return Native.capabilities();
    },

    async profiles(): Promise<BrowserProfile[]> {
        return JSON.parse(await native().listProfiles());
    },
    async createProfile(name: string): Promise<BrowserProfile> {
        return JSON.parse(await native().createProfile(name));
    },
    renameProfile: (id: string, name: string) => native().renameProfile(id, name),
    deleteProfile: (id: string) => native().deleteProfile(id),
    clearProfile: (id: string) => native().clearProfile(id),
    async profileSites(id: string): Promise<BrowserProfileSite[]> {
        return JSON.parse(await native().profileSites(id));
    },
    forgetSite: (id: string, site: string) => native().forgetSite(id, site),

    async start(opts: { sessionId: string; profileId?: string | null; profileName?: string | null }) {
        await ensureScripts();
        const { sessionId, profileId = null, profileName = null } = opts;
        return native().start(sessionId, profileId, profileName);
    },
    close: (sessionId: string) => native().close(sessionId),
    navigate: (sessionId: string, url: string) => native().navigate(sessionId, url),
    history: (sessionId: string, action: 'back' | 'forward' | 'reload' | 'stop') => native().history(sessionId, action),
    status: (sessionId: string) => native().status(sessionId),

    /**
     * Runs `call` (an expression over window.__bu) in the page and returns its value.
     * Throws with the page's own message when the expression threw.
     */
    async page<T = any>(sessionId: string, call: string): Promise<T> {
        const raw = await native().page(sessionId, call);
        if (raw === null || raw === undefined || raw === 'null' || raw === 'undefined') return null as T;
        const value = JSON.parse(raw);
        if (value && typeof value === 'object' && '__error' in value) throw new Error(String(value.__error));
        return value as T;
    },
    tap: (sessionId: string, x: number, y: number, viewportWidth: number) => native().tap(sessionId, x, y, viewportWidth),
    drag: (sessionId: string, x: number, y: number, deltaCss: number, viewportWidth: number) => native().drag(sessionId, x, y, deltaCss, viewportWidth),
    capture: (sessionId: string, width: number, quality: number) => native().capture(sessionId, width, quality),
    takeNotices: (sessionId: string) => native().takeNotices(sessionId),
    addNotice: (sessionId: string, text: string) => native().addNotice(sessionId, text),

    /** Live url/title/loading updates for every session (the viewer header listens) */
    onStatus(listener: (event: BrowserStatusEvent) => void): () => void {
        if (!Native) return () => { };
        const emitter = new NativeEventEmitter(NativeModules.BrowserUseModule);
        const subscription = emitter.addListener('BrowserUseStatus', listener);
        return () => subscription.remove();
    },
};

/** Shows a session's WebView. `interactive` lets the user's touches and keyboard reach the page. */
export const BrowserUseHostView = Platform.OS === 'android'
    ? requireNativeComponent<ViewProps & { sessionId: string | null; interactive: boolean }>('BrowserUseHostView')
    : null;
