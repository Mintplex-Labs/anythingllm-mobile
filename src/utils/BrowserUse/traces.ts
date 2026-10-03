import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * On-device history of every browser session the agent ran, so the user can always review which
 * sites it visited and what it did there - the mobile counterpart of the desktop BrowserTraces
 * (server/utils/agents/aibitat/plugins/browser-use/traces.js). One JSON file per session.
 */

export const TRACES_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/browser-use/traces`;
/** Step thumbnails make a trace up to ~1MB, so keep fewer than desktop's 200 */
const MAX_TRACES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BrowserTraceStatus = 'running' | 'needs-help' | 'done' | 'incomplete' | 'failed' | 'stopped';

export type BrowserTraceStep = {
    /** ISO timestamp */
    at: string;
    /** Tool name the agent called */
    action: string;
    /** Human readable description of the step */
    label: string;
    ok: boolean;
    url: string | null;
    title: string | null;
    favicon: string | null;
    /** base64 jpeg */
    thumbnail: string | null;
    /** What the page sent to the site during this step (metadata only) */
    sent: Array<{ label: string; method: string; status: number | null; ok: boolean | null }> | null;
};

export type BrowserTrace = {
    id: string;
    task: string;
    profile: string;
    status: BrowserTraceStatus;
    summary: string | null;
    gaveUp?: string;
    workspace: { slug: string; name: string } | null;
    model: string | null;
    tokens: { prompt: number; completion: number; total: number };
    startedAt: string;
    endedAt: string | null;
    steps: BrowserTraceStep[];
};

export type BrowserTraceSummary = Omit<BrowserTrace, 'steps'> & {
    stepCount: number;
    sites: Array<{ host: string; favicon: string | null }>;
};

const SUMMARY_SUFFIX = '.summary.json';

function summaryFileFor(file: string) {
    return file.replace(/\.json$/, SUMMARY_SUFFIX);
}

async function writeAtomically(path: string, contents: string) {
    await RNFS.writeFile(`${path}.tmp`, contents, 'utf8');
    if (await RNFS.exists(path)) await RNFS.unlink(path);
    await RNFS.moveFile(`${path}.tmp`, path);
}

function fileFor(id: string) {
    if (!UUID.test(String(id))) return null;
    return `${TRACES_FOLDER_PATH}/${id}.json`;
}

/** Distinct sites a session visited, in visit order. */
export function sitesOf(steps: BrowserTraceStep[] = []) {
    const seen = new Map<string, { host: string; favicon: string | null }>();
    for (const step of steps) {
        if (!step.url) continue;
        try {
            const { host, protocol } = new URL(step.url);
            if (!protocol.startsWith('http') || seen.has(host)) continue;
            seen.set(host, { host, favicon: step.favicon || null });
        } catch { }
    }
    return [...seen.values()];
}

// Writes for one trace are chained so a slow write never lands after a newer one.
const writeQueue = new Map<string, Promise<void>>();

const BrowserTraces = {
    /** Writes the trace plus a small summary file next to it, so listing never reads the thumbnails. */
    async save(trace: BrowserTrace) {
        const file = fileFor(trace.id);
        if (!file) return;
        const { steps = [], ...meta } = trace;
        const summary: BrowserTraceSummary = { ...meta, stepCount: steps.length, sites: sitesOf(steps) };
        const json = JSON.stringify(trace);
        const summaryJson = JSON.stringify(summary);
        const previous = writeQueue.get(trace.id) ?? Promise.resolve();
        const next = previous.then(async () => {
            try {
                await RNFS.mkdir(TRACES_FOLDER_PATH);
                await writeAtomically(file, json);
                await writeAtomically(summaryFileFor(file), summaryJson);
            } catch (error) {
                console.error('[BrowserTraces] Failed to save trace:', (error as Error)?.message);
            }
        });
        writeQueue.set(trace.id, next);
        await next;
        if (writeQueue.get(trace.id) === next) writeQueue.delete(trace.id);
    },

    async get(id: string): Promise<BrowserTrace | null> {
        try {
            const file = fileFor(id);
            if (!file || !(await RNFS.exists(file))) return null;
            return JSON.parse(await RNFS.readFile(file, 'utf8'));
        } catch {
            return null;
        }
    },

    /** Trace summaries (no steps), newest first. */
    async list(): Promise<BrowserTraceSummary[]> {
        if (!(await RNFS.exists(TRACES_FOLDER_PATH))) return [];
        const traces: BrowserTraceSummary[] = [];
        for (const item of await RNFS.readDir(TRACES_FOLDER_PATH)) {
            if (!item.name.endsWith(SUMMARY_SUFFIX)) continue;
            try {
                traces.push(JSON.parse(await RNFS.readFile(item.path, 'utf8')));
            } catch { }
        }
        return traces.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    async delete(id: string) {
        const file = fileFor(id);
        if (!file) return;
        for (const path of [file, summaryFileFor(file)]) if (await RNFS.exists(path)) await RNFS.unlink(path);
    },

    async deleteAll() {
        if (await RNFS.exists(TRACES_FOLDER_PATH)) await RNFS.unlink(TRACES_FOLDER_PATH);
    },

    /** Keep the history from growing forever. */
    async prune() {
        try {
            const traces = await this.list();
            for (const trace of traces.slice(MAX_TRACES)) await this.delete(trace.id);
        } catch { }
    },
};

export default BrowserTraces;
