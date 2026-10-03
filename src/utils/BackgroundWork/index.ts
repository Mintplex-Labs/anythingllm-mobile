import { NativeModules, Platform } from 'react-native';
import i18n from '@/i18n';

/**
 * Keeps long-running JS work alive while the app is in the background, through one shared
 * Android foreground service (android/.../background/BackgroundWorkService.kt).
 *
 * Android freezes a backgrounded app within seconds, which stalls the JS thread and drops open
 * connections to cloud providers. Register work with `begin`, keep its notification current with
 * `update` (the notification shows the most recently updated task), and always `end` it.
 *
 * Used by the browser agent. Long replies from external providers and scheduled jobs can use it the
 * same way - never the on-device model. A no-op on iOS.
 *
 * Keeping the process alive is not enough on its own: React Native pauses JS timers in the
 * background unless a headless JS task is running, so native also starts the keep-alive task below
 * while any work is registered (registered in index.js).
 */

/** Must match KEEP_ALIVE_TASK in BackgroundWorkModule.kt */
export const BACKGROUND_WORK_KEEP_ALIVE_TASK = 'BackgroundWorkKeepAlive';

/** Work registered from JS - the keep-alive task ends once this is empty */
const active = new Set<string>();
let releaseKeepAlive: Array<() => void> = [];

function settleKeepAliveIfIdle() {
    if (active.size) return;
    const waiting = releaseKeepAlive;
    releaseKeepAlive = [];
    waiting.forEach((release) => release());
}

/** The headless keep-alive task: holds JS timers running until the last piece of work ends. */
export function runBackgroundWorkKeepAlive(): Promise<void> {
    return new Promise((resolve) => {
        releaseKeepAlive.push(resolve);
        settleKeepAliveIfIdle();
    });
}

type NativeBackgroundWork = {
    configure(channelName: string, moreTasks: string): Promise<boolean>;
    upsert(id: string, title: string, body: string): Promise<boolean>;
    end(id: string): Promise<boolean>;
};

const Native: NativeBackgroundWork | undefined = Platform.OS === 'android' ? NativeModules.BackgroundWorkModule : undefined;

let configured = false;
function configure() {
    if (!Native || configured) return;
    configured = true;
    Native.configure(i18n.t('notifications.background_work.channel'), i18n.t('notifications.background_work.more_tasks')).catch(() => { configured = false; });
    // Channel names show in system settings - follow the app language.
    i18n.on?.('languageChanged', () => { configured = false; });
}

const BackgroundWork = {
    /**
     * Starts keeping the app alive for `id`, showing `title` / `body` in the notification.
     * Resolves false when Android would not start the service (the app was already in the background).
     */
    async begin(id: string, { title, body }: { title: string; body: string }): Promise<boolean> {
        active.add(id);
        if (!Native) return false;
        configure();
        return Native.upsert(id, title, body).catch(() => false);
    },

    /** Changes what the notification says for `id` (and starts the service if it was not running yet). */
    async update(id: string, { title, body }: { title: string; body: string }): Promise<boolean> {
        if (!Native) return false;
        configure();
        return Native.upsert(id, title, body).catch(() => false);
    },

    /** The work is over - the service stops once nothing else is registered. */
    async end(id: string): Promise<void> {
        active.delete(id);
        settleKeepAliveIfIdle();
        await Native?.end(id).catch(() => { });
    },
};

export default BackgroundWork;
