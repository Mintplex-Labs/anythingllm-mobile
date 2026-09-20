import { useEffect, useRef } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import ScheduledJob from '@/database/models/ScheduledJob';
import ScheduledJobRunner from './runner';

/**
 * Wakes the runner at the right times.
 *
 * Foreground: `useScheduledJobsTicker` runs due jobs when the app opens / returns to the
 * foreground and then every `TICK_INTERVAL_MS` while it stays there.
 *
 * Background (Android): after every pass the earliest upcoming run across all enabled jobs is
 * handed to the native `ScheduledJobsModule`, which enqueues a WorkManager one-time work request
 * for that moment. When it fires, `ScheduledJobsWorker` starts the React runtime headlessly and
 * runs the `ScheduledJobsTask` headless task (registered in index.js), which comes back here.
 * WorkManager survives reboots and respects Doze, so runs may land a little later than
 * scheduled - the trade for needing no extra permissions.
 *
 * iOS has no background path yet (the app does not ship there) - jobs run on next open.
 */

const TICK_INTERVAL_MS = 60 * 1000;
/** WorkManager stops a worker after 10 minutes - leave headroom for the last job to be saved. */
const BACKGROUND_PASS_BUDGET_MS = 8 * 60 * 1000;

export const SCHEDULED_JOBS_HEADLESS_TASK = 'ScheduledJobsTask';

type ScheduledJobsNativeModule = {
    scheduleNextRun(atMillis: number): Promise<boolean>;
    cancelScheduledRun(): Promise<boolean>;
    /** Tells the WorkManager worker the background pass is over so it can release its slot */
    notifyBackgroundPassFinished(): void;
};

const native: ScheduledJobsNativeModule | null =
    Platform.OS === 'android' && NativeModules.ScheduledJobsModule ? NativeModules.ScheduledJobsModule : null;

function log(text: string, ...args: any[]) {
    console.log(`\x1b[36m[ScheduledJobs:scheduler] ${text}\x1b[0m`, ...args); // eslint-disable-line no-console
}

/** Whether this platform can run jobs while the app is closed. */
export function supportsBackgroundRuns(): boolean {
    return native !== null;
}

/**
 * Point the native alarm at the earliest upcoming run (or clear it when no job is enabled).
 * Call after anything that changes a schedule: job saved/toggled/deleted, or a pass finished.
 */
export async function syncNativeSchedule(): Promise<void> {
    if (!native) return;
    try {
        const next = await ScheduledJob.earliestNextRunAt();
        if (next === null) {
            await native.cancelScheduledRun();
            log('No enabled jobs - background run cancelled');
            return;
        }
        await native.scheduleNextRun(next);
        log(`Next background run scheduled for ${new Date(next).toLocaleString()}`);
    } catch (error) {
        log('Failed to sync native schedule', error);
    }
}

/** One scheduler pass: run whatever is due, then re-arm the native alarm. */
export async function tick(trigger: 'foreground' | 'background'): Promise<void> {
    const deadline = trigger === 'background' ? Date.now() + BACKGROUND_PASS_BUDGET_MS : Number.POSITIVE_INFINITY;
    const result = await ScheduledJobRunner.runDueJobs(trigger, deadline);
    if (result.ran || result.deferred) log(`Pass (${trigger}) ran ${result.ran}, deferred ${result.deferred}${result.blocked ? `, blocked: ${result.blocked}` : ''}`);
    await syncNativeSchedule();
}

/** Body of the headless task WorkManager starts while the app is closed. */
export async function runHeadlessScheduledJobs(): Promise<void> {
    log('Headless task started');
    try {
        await tick('background');
    } finally {
        log('Headless task finished');
        try { native?.notifyBackgroundPassFinished(); } catch { /* worker falls back to the headless finish listener / timeout */ }
    }
}

/** Mount once in `App` - runs due jobs while the app is open and keeps the background alarm armed. */
export function useScheduledJobsTicker() {
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const start = () => {
            if (timer.current) return;
            tick('foreground');
            timer.current = setInterval(() => tick('foreground'), TICK_INTERVAL_MS);
        };
        const stop = () => {
            if (!timer.current) return;
            clearInterval(timer.current);
            timer.current = null;
        };

        if (AppState.currentState === 'active') start();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') start();
            else stop();
        });
        return () => {
            stop();
            subscription.remove();
        };
    }, []);
}
