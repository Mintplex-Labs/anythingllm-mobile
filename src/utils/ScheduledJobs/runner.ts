import { type WorkspaceType } from '@/database/models/Workspace';
import ScheduledJob, { type ScheduledJobType } from '@/database/models/ScheduledJob';
import ScheduledJobRun, { type ScheduledJobRunTrigger, type ScheduledJobRunType } from '@/database/models/ScheduledJobRun';
import WorkspaceChat, { type WorkspaceChatResponseType } from '@/database/models/WorkspaceChat';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import AssistantTurn from '@/hooks/useChatHandler/turn';
import getLLM from '@/utils/AiProviders';
import { type IStreamEvent, type IStreamResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import ToolsManager, { isOnDeviceProviderName } from '@/utils/ToolsManager';
import { isAbortError } from '@/utils/chat/abort';
import { activateKeepAwake, deactivateKeepAwake } from '@/utils/keepAwake';
import PushNotifications from '@/utils/PushNotifications';
import Telemetry from '@/utils/Telemetry';
import uiStore from '@/store/UIStore';
import { getDefaultContextLength } from '@/utils/contextLength';

/** A single run is stopped after this long (mirrors SCHEDULED_JOB_TIMEOUT_MS on the desktop server). */
export const SCHEDULED_JOB_TIMEOUT_MS = 5 * 60 * 1000;
/** Runs still queued/running after this long were orphaned by a crash or process kill. */
const ORPHANED_RUN_AGE_MS = SCHEDULED_JOB_TIMEOUT_MS + 60 * 1000;

/** Why jobs cannot run right now. `null` means they can. */
export type JobsBlockedReason = 'no_provider' | 'on_device_provider' | null;

export type RunDueJobsResult = {
    /** Jobs that were executed in this pass (completed or failed) */
    ran: number;
    /** Due jobs left for a later pass (deadline reached or a run was already in flight) */
    deferred: number;
    blocked: JobsBlockedReason;
};

/**
 * Stand-in workspace scheduled jobs run against. Jobs are global, not tied to a user workspace,
 * so the provider gets this fixed one: no documents (no RAG), no per-workspace memories, and a
 * system prompt that tells the model it is working unattended.
 */
export const SCHEDULED_JOBS_WORKSPACE_SLUG = 'scheduled-jobs';
const SCHEDULED_JOBS_SYSTEM_PROMPT = [
    'You are AnythingLLM running an automated scheduled job on the user\'s phone.',
    'Nobody is watching this run and nobody can answer you, so never ask questions or wait for confirmation - make sensible assumptions and finish the task in one pass.',
    'Use the tools you have been given whenever they help you complete the task.',
    'Reply with the complete result the user will read later. If you created a file, mention it briefly in the reply.',
].join(' ');

function scheduledJobsWorkspace(): WorkspaceType {
    return {
        name: 'Scheduled Jobs',
        slug: SCHEDULED_JOBS_WORKSPACE_SLUG,
        systemPrompt: SCHEDULED_JOBS_SYSTEM_PROMPT,
        temperature: null,
        contextLength: getDefaultContextLength(),
        isRemote: false,
        remoteConfig: null as any,
        threads: [],
        createdAt: 0,
        remoteServerReachable: async () => false,
        remoteModelTag: async () => '',
    };
}

class JobTimeoutError extends Error {
    constructor() {
        super('SCHEDULED_JOB_TIMEOUT');
        this.name = 'JobTimeoutError';
    }
}

/** Whether a finished reply has anything worth telling the user about. */
export function runHasContent(result: WorkspaceChatResponseType | null | undefined): boolean {
    if (!result) return false;
    if (result.textResponse?.trim()) return true;
    if (result.actions?.length) return true;
    return false;
}

/**
 * Executes scheduled jobs. Every job runs the same way a chat turn does - the configured
 * external provider streams a reply into an `AssistantTurn` while `ToolsManager` executes the
 * job's tools - except nothing is on screen: the finished reply is written to the run row.
 *
 * Two things drive it:
 *  - the foreground ticker (`useScheduledJobsTicker`) while the app is open
 *  - the Android WorkManager worker via a headless JS task when it is not
 * Both funnel into `runDueJobs`, which is serialized so overlapping triggers never run a job twice.
 *
 * Hard limit: jobs only run with an external LLM provider. The on-device model cannot be loaded
 * from the background (memory), so with it selected jobs are skipped and the UI says so.
 */
class ScheduledJobRunner {
    static instance: ScheduledJobRunner;
    private pass: Promise<RunDueJobsResult> | null = null;
    /** uuid of the job executing right now, if any */
    public runningJobUuid: string | null = null;

    constructor() {
        if (ScheduledJobRunner.instance) return ScheduledJobRunner.instance;
        ScheduledJobRunner.instance = this;
    }

    log = (text: string, ...args: any[]) => {
        console.log(`\x1b[36m[ScheduledJobs] ${text}\x1b[0m`, ...args); // eslint-disable-line no-console
    };

    /** The saved LLM preference, or the reason jobs cannot run with it. */
    async providerGate(): Promise<{ blocked: JobsBlockedReason; provider: string; config: Record<string, any> }> {
        const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} as Record<string, any> });
        const provider = preferences?.provider ?? 'unknown';
        if (!provider || provider === 'unknown') return { blocked: 'no_provider', provider, config: {} };
        if (isOnDeviceProviderName(provider)) return { blocked: 'on_device_provider', provider, config: {} };
        return { blocked: null, provider, config: preferences.config ?? {} };
    }

    /**
     * Run every enabled job whose next run is due. Serialized: a second call while a pass is in
     * progress joins the running pass instead of starting another.
     * @param trigger - what woke us up
     * @param deadline - epoch ms after which no further job is started (the background worker has a hard time limit)
     */
    runDueJobs(trigger: 'foreground' | 'background', deadline: number = Number.POSITIVE_INFINITY): Promise<RunDueJobsResult> {
        if (this.pass) return this.pass;
        this.pass = this._runDueJobs(trigger, deadline).finally(() => { this.pass = null; });
        return this.pass;
    }

    private async _runDueJobs(trigger: 'foreground' | 'background', deadline: number): Promise<RunDueJobsResult> {
        const result: RunDueJobsResult = { ran: 0, deferred: 0, blocked: null };
        try {
            await ScheduledJobRun.failOrphanedRuns(ORPHANED_RUN_AGE_MS);
            const due = await ScheduledJob.due();
            if (!due.length) return result;

            const gate = await this.providerGate();
            if (gate.blocked) {
                // Skip - but move the schedule forward so the job is not re-attempted every tick.
                this.log(`${due.length} job(s) due but skipped: ${gate.blocked}`);
                await ScheduledJob.recomputeNextRuns();
                result.blocked = gate.blocked;
                result.deferred = due.length;
                return result;
            }

            this.log(`${due.length} job(s) due (${trigger})`);
            // Oldest due first so a job that has waited longest is not starved by a chatty one
            due.sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0));
            for (const job of due) {
                if (Date.now() >= deadline) {
                    result.deferred++;
                    continue;
                }
                const run = await this.execute(job, 'schedule', gate);
                if (run) result.ran++;
                else result.deferred++;
            }
        } catch (error) {
            this.log('runDueJobs failed', error);
        }
        return result;
    }

    /**
     * Run one job right now regardless of its schedule ("Run now"). Resolves with the run, or null
     * when a run of this job is already in flight or jobs are blocked (caller shows why).
     */
    async runJobNow(jobUuid: string): Promise<{ run: ScheduledJobRunType | null; blocked: JobsBlockedReason; inFlight: boolean }> {
        const job = await ScheduledJob.findByUuid(jobUuid);
        if (!job) return { run: null, blocked: null, inFlight: false };
        const gate = await this.providerGate();
        if (gate.blocked) return { run: null, blocked: gate.blocked, inFlight: false };
        if (await ScheduledJobRun.hasInFlightRun(jobUuid)) return { run: null, blocked: null, inFlight: true };
        const run = await this.execute(job, 'manual', gate);
        return { run, blocked: null, inFlight: run === null };
    }

    /**
     * Executes one job start to finish and returns its run row, or null if a run was already in
     * flight. Never throws - failures land on the run row.
     */
    private async execute(
        job: ScheduledJobType,
        trigger: ScheduledJobRunTrigger,
        gate: { provider: string; config: Record<string, any> },
    ): Promise<ScheduledJobRunType | null> {
        const run = await ScheduledJobRun.start(job.uuid, trigger);
        if (!run) {
            this.log(`Job "${job.name}" already has a run in flight - skipping`);
            return null;
        }

        // Stamp lastRunAt and move nextRunAt to the next occurrence after now (a manual run of an
        // overdue job counts as that run, so it is not run again a minute later).
        await ScheduledJob.markRun(job.uuid);
        await ScheduledJobRun.markRunning(run.uuid);
        this.runningJobUuid = job.uuid;
        this.log(`Running job "${job.name}" (${trigger}) run=${run.uuid}`);

        const chat = WorkspaceChat.newChatItem({ workspaceThreadSlug: SCHEDULED_JOBS_WORKSPACE_SLUG, prompt: job.prompt }) as DynamicChatMessage;
        const turn = new AssistantTurn(chat);
        const abortController = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            abortController.abort();
        }, SCHEDULED_JOB_TIMEOUT_MS);

        const startedAt = Date.now();
        let finalRun: ScheduledJobRunType | null = null;
        try {
            try { activateKeepAwake(); } catch { /* no activity in the background - nothing to keep awake */ }
            const provider = getLLM(gate.provider, gate.config);
            provider.attachWorkspaceToProvider(scheduledJobsWorkspace());
            provider.attachAbortSignal(abortController.signal);

            const toolset = ToolsManager.getToolsByIds(job.tools);
            this.log(`Job "${job.name}" tools: ${toolset.map(t => t.id).join(', ') || 'none'}`);

            await Promise.race([
                provider.chat({
                    messages: [chat],
                    streaming: true,
                    onStream: (event: IStreamEvent, data: IStreamResponse) => { turn.applyEvent(event, data); },
                    toolset,
                    autoApproveTools: true,
                }),
                new Promise<never>((_, reject) => {
                    abortController.signal.addEventListener('abort', () => reject(new JobTimeoutError()), { once: true });
                }),
            ]);
            provider.attachAbortSignal(null);

            const response = turn.finalize().response as WorkspaceChatResponseType;
            finalRun = await ScheduledJobRun.complete(run.uuid, response);
            this.log(`Job "${job.name}" completed in ${Date.now() - startedAt}ms`);
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_RAN, { status: 'completed', trigger, tools: job.tools.length });

            if (job.notifyOnComplete && runHasContent(response)) {
                await PushNotifications.notifyScheduledJobComplete({
                    jobName: job.name,
                    preview: response.textResponse || (response.actions?.length ? 'Your job finished and created files for you.' : ''),
                    jobUuid: job.uuid,
                    runUuid: run.uuid,
                });
            }
        } catch (error: any) {
            const partial = safeFinalize(turn);
            if (timedOut || error instanceof JobTimeoutError || (isAbortError(error) && timedOut)) {
                this.log(`Job "${job.name}" timed out`);
                finalRun = await ScheduledJobRun.timeout(run.uuid, partial);
                Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_RAN, { status: 'timed_out', trigger, tools: job.tools.length });
            } else {
                const message = error?.message || 'Job failed';
                this.log(`Job "${job.name}" failed: ${message}`);
                finalRun = await ScheduledJobRun.fail(run.uuid, message, partial);
                Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_RAN, { status: 'failed', trigger, tools: job.tools.length });
            }
        } finally {
            clearTimeout(timeout);
            this.runningJobUuid = null;
            try { deactivateKeepAwake(); } catch { /* see above */ }
        }
        return finalRun;
    }
}

/** Whatever the turn produced before it failed - kept on the run so the user can see how far it got. */
function safeFinalize(turn: AssistantTurn): WorkspaceChatResponseType | null {
    try {
        const response = turn.finalize().response as WorkspaceChatResponseType;
        if (!response.textResponse && !response.activity?.length && !response.actions?.length) return null;
        return response;
    } catch {
        return null;
    }
}

export default new ScheduledJobRunner();
