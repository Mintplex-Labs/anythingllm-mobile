import { type ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import { type toolDefinitions } from '../tools';
import { type BrowserEarlierTask, type BrowserTrace, type BrowserTraceStatus } from '../traces';

/** What the sub-agent needs from the chat provider */
export type BrowserAgentLLM = {
    completeWithTools(messages: any[], tools: ReturnType<typeof toolDefinitions>): Promise<ICompleteResponse>;
};

/** One tool call of the model, with the raw form echoed back to it in later turns */
export type ToolCall = {
    name: string;
    args: Record<string, any>;
    raw: { id: string; name: string; arguments: string; extra_content?: any };
    /** "label@url" of the element acted on - ids change as pages lazy-load, so loops are spotted by this */
    target?: string;
};

/** A step in the agent's working history, at the three lengths the context builder can show it */
export type AgentRecord = {
    call: ToolCall;
    /** Result as shown when it is the latest record */
    full: string;
    /** One-line result once it is older */
    short: string;
    /** Trimmed result kept a little longer (reads, user replies) */
    medium: string | null;
    /** Screenshot - only ever sent while this is the latest record */
    image?: string | null;
};

/** An earlier task of the browser this session continues */
export type EarlierTask = BrowserEarlierTask & { notes?: string[]; userPage?: BrowserTrace['userPage'] };

/** The live state shown in the chat card - persisted with the chat once the session ends. */
export type BrowserSessionSnapshot = {
    sessionId: string;
    task: string;
    profile: string;
    status: BrowserTraceStatus;
    summary: string | null;
    question: string | null;
    tokens: { prompt: number; completion: number; total: number; estimated: boolean };
    stepCount: number;
    step: { label: string; ok: boolean; url: string | null; title: string | null; favicon: string | null } | null;
    recentSteps: Array<{ label: string; ok: boolean; favicon: string | null; url: string | null }>;
    sites: Array<{ host: string; favicon: string | null }>;
    /** The session this one picked up from (missing on sessions saved before this existed) */
    continuedFrom?: string | null;
    startedAt: string;
    endedAt: string | null;
};

/**
 * Picking up where an earlier session of the same chat left off. Only its trace is needed - the
 * profile keeps the cookies and storage, so reopening its last page brings back the sign-ins and
 * cart (single-page app state that lives only in the tab is lost).
 */
export type BrowserAgentResume = {
    /** The earlier session's trace - its profile, last page and results */
    from: BrowserTrace;
};
