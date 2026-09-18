import ScheduledJob from "@/database/models/ScheduledJob";
import { type IScheduledJobCreatedAction } from "@/database/models/WorkspaceChat";
import { type ToolExecutionContext, type ToolManagerTool } from "@/utils/ToolsManager";
import ToolApproval from "@/utils/ToolsManager/toolApproval";
import { describeCron, isValidCron, nextCronRun } from "@/utils/ScheduledJobs/cron";
import { parseToolArgs, type StreamEmitter } from "../createFiles/shared";
import Telemetry from "@/utils/Telemetry";

type Args = {
    name: string;
    prompt: string;
    schedule: string;
    tools: string[];
    notify_on_complete: boolean;
};

const TOOL_ID = 'createScheduledJob';

/** Ids the model may put in `tools` - every job-eligible tool except this one (lazy: ToolsManager imports this file) */
function eligibleToolIds(): string[] {
    const ToolsManager = require("@/utils/ToolsManager").default;
    return ToolsManager.scheduledJobEligibleTools.filter((tool: ToolManagerTool) => tool.id !== TOOL_ID).map((tool: ToolManagerTool) => tool.id);
}

/**
 * Lets the assistant set up a scheduled job from the conversation - the mobile counterpart of
 * the desktop `create-scheduled-job` agent plugin. The user always confirms through the tool
 * approval card before anything is created, and the tool refuses to run unattended (from inside
 * another job) so jobs can never spawn jobs. On success a `scheduled_job_created` action is
 * pushed into the turn, which the chat history renders as a card linking to the job.
 *
 * Cloud providers only: like document generation it costs a full turn of tokens and the
 * on-device model would spend them re-asking for the fields.
 */
const tool = {
    id: TOOL_ID,
    name: 'Create Scheduled Job',
    description: 'Let the assistant set up a recurring job from the conversation, after you approve it.',
    defaultEnabled: true,
    category: 'default' as const,
    supportsOnDevice: false,
    hiddenFromScheduledJobs: true,
    get definition() {
        return {
            type: 'function' as const,
            function: {
                name: 'create_scheduled_job',
                description:
                    'Create a scheduled job: a prompt the assistant runs automatically on a recurring schedule with a chosen set of tools, ' +
                    'saving each result for the user to read later. Use when the user asks for something to happen regularly or at a set time ' +
                    '(eg: "every morning summarize Hacker News", "each Friday draft my weekly report"). ' +
                    'The user is asked to approve the job before it is created - describe it accurately. ' +
                    'Write the prompt so it works with nobody around to answer questions. ' +
                    'The schedule is a standard 5-field cron expression in the user\'s local time (minute hour day-of-month month day-of-week, Sunday = 0). ' +
                    'Examples: "0 9 * * *" = every day 9:00 AM, "30 18 * * 1-5" = weekdays 6:30 PM, "0 8 1 * *" = 1st of each month 8:00 AM, "*/30 * * * *" = every 30 minutes.',
                parameters: {
                    type: 'object' as const,
                    properties: {
                        name: { type: 'string', description: 'Short name for the job eg: "Morning Hacker News digest".' },
                        prompt: { type: 'string', description: 'The full prompt to run each time. Be specific and self-contained.' },
                        schedule: { type: 'string', description: '5-field cron expression in the user\'s local time.' },
                        tools: {
                            type: 'array',
                            description: 'Tool ids the job may use. Pick only what the prompt needs; an empty list means a plain reply with no tools.',
                            items: { type: 'string', enum: eligibleToolIds() },
                        },
                        notify_on_complete: { type: 'boolean', description: 'Send the user a notification when a run finishes with a result. Defaults to true.' },
                    },
                    required: ['name', 'prompt', 'schedule'] as const,
                },
            },
        };
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: StreamEmitter, context: ToolExecutionContext = {}): Promise<string> {
        try {
            const parsed = parseToolArgs<Args>(args, { name: '', prompt: '', schedule: '', tools: [], notify_on_complete: true });
            const name = String(parsed.name ?? '').trim();
            const prompt = String(parsed.prompt ?? '').trim();
            const schedule = String(parsed.schedule ?? '').trim();
            const notifyOnComplete = parsed.notify_on_complete !== false;

            // Never from inside another job - the person who approves must be looking at the screen.
            if (context.autoApproveTools) return 'Scheduled jobs cannot be created from an unattended run. Ask the user to set this up from a chat instead.';

            if (!name) return 'A name is required. No job was created.';
            if (!prompt) return 'A prompt is required. No job was created.';
            if (!isValidCron(schedule)) return `"${schedule}" is not a valid 5-field cron expression. Use the form "minute hour day-of-month month day-of-week", eg: "0 9 * * *". No job was created.`;

            const eligible = new Set(eligibleToolIds());
            const requested = Array.isArray(parsed.tools) ? parsed.tools.map(String) : [];
            const tools = [...new Set(requested.filter((id) => eligible.has(id)))];
            const rejected = requested.filter((id) => !eligible.has(id));
            if (rejected.length) return `Unknown tool id(s): ${rejected.join(', ')}. Available tool ids: ${[...eligible].join(', ')}. No job was created - call again with valid ids.`;

            const when = describeCron(schedule);
            streamEmitter('report_status', `Asking to schedule "${name}" (${when})`);
            const approval = await ToolApproval.request({
                skillName: this.definition.function.name,
                description: `Create the scheduled job "${name}"? It will run ${when.charAt(0).toLowerCase()}${when.slice(1)}${tools.length ? ` using ${tools.length} tool${tools.length === 1 ? '' : 's'}` : ' with no tools'}${notifyOnComplete ? ' and notify you when it finishes' : ''}.`,
                payload: { name, schedule: when, cron: schedule, tools, prompt },
                streamEmitter,
                signal: context.signal,
            });
            if (!approval.approved) {
                streamEmitter('report_status', 'Scheduled job was not approved');
                return `${approval.message} The job was not created.`;
            }

            const job = await ScheduledJob.create({ name, prompt, schedule, tools, enabled: true, notifyOnComplete });
            // Lazy: the scheduler imports the runner, which imports ToolsManager, which imports this tool.
            const { syncNativeSchedule } = require("@/utils/ScheduledJobs/scheduler");
            await syncNativeSchedule();
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_CREATED, { tools: tools.length, notify: notifyOnComplete, source: 'tool' });

            const action: IScheduledJobCreatedAction = {
                type: 'scheduled_job_created',
                action: { jobUuid: job.uuid, jobName: job.name, schedule: job.schedule },
            };
            streamEmitter('report_action', action);
            streamEmitter('report_status', `Scheduled "${job.name}"`);

            const next = nextCronRun(job.schedule);
            return `Created the scheduled job "${job.name}" (${when}).${next ? ` First run: ${next.toLocaleString()}.` : ''} Tools: ${tools.length ? tools.join(', ') : 'none'}. The user can see it in Scheduled Jobs from the sidebar; tell them briefly what it will do and when. Do not repeat the prompt back verbatim.`;
        } catch (error: any) {
            console.error('[createScheduledJob] failed', error);
            return `Could not create the scheduled job: ${error?.message ?? 'unknown error'}.`;
        }
    },
};

export default tool;
