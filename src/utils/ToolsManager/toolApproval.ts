import { generateUUID } from "@/utils/constants";
import { type IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { type IToolApprovalRequest } from "@/database/models/WorkspaceChat";

/**
 * User consent gate for tool work that is slow or costly - the mobile counterpart of
 * `aibitat.requestToolApproval` in the desktop app (server/utils/agents/aibitat/plugins/websocket.js).
 *
 * Desktop asks over the websocket and waits for the frontend to answer. Here everything is
 * in-process: the request is pushed into the assistant turn as a `request_tool_approval`
 * stream event (which the chat history renders as an approve/reject card) and the card
 * answers through `respond()`. Whichever lands first settles the request exactly once:
 *  - the user tapping approve / reject
 *  - the session abort signal firing (the user stopped the reply)
 *  - the timeout elapsing
 *
 * The outcome is echoed back into the turn as `report_tool_approval_result` so the card
 * collapses into the activity chain, and the caller gets `{ approved, message }` to hand
 * back to the model.
 */

/** How long a request stays open before it is treated as rejected */
export const TOOL_APPROVAL_TIMEOUT_MS = 60_000;

export type ToolApprovalResult = {
    approved: boolean;
    /** Human readable reason - suitable to return to the model as the tool result */
    message: string;
}

export const TOOL_APPROVAL_MESSAGES = {
    approved: 'User approved the tool execution.',
    rejected: 'Tool call was rejected by the user.',
    timedOut: 'Tool approval request timed out. User did not respond in time.',
    aborted: 'Session was aborted while awaiting tool approval.',
} as const;

type PendingApproval = {
    settle: (result: ToolApprovalResult) => void;
}

class ToolApprovalManager {
    static instance: ToolApprovalManager;
    private pending = new Map<string, PendingApproval>();

    constructor() {
        if (ToolApprovalManager.instance) return ToolApprovalManager.instance;
        ToolApprovalManager.instance = this;
    }

    log = (text: string, ...args: any[]) => {
        console.log(`\x1b[35m[ToolApproval] ${text}\x1b[0m`, ...args);
    }

    /**
     * Ask the user for permission before continuing with a tool. Resolves (never rejects)
     * with the outcome - callers decide what to do with a denial.
     *
     * @param skillName - what the model wants to run, shown in the card header
     * @param description - plain language explanation of what approving will do
     * @param payload - optional arguments to show in the expandable details section
     * @param streamEmitter - the tool's stream emitter, so the request lands in the current turn
     * @param signal - session abort signal; aborting settles the request as denied
     * @param timeoutMs - defaults to TOOL_APPROVAL_TIMEOUT_MS
     */
    request({
        skillName,
        description = null,
        payload = {},
        streamEmitter,
        signal = null,
        timeoutMs = TOOL_APPROVAL_TIMEOUT_MS,
    }: {
        skillName: string;
        description?: string | null;
        payload?: Record<string, any>;
        streamEmitter: (event: IStreamEvent, data: any) => void;
        signal?: AbortSignal | null;
        timeoutMs?: number;
    }): Promise<ToolApprovalResult> {
        const requestId = generateUUID();
        if (signal?.aborted) return Promise.resolve({ approved: false, message: TOOL_APPROVAL_MESSAGES.aborted });

        return new Promise<ToolApprovalResult>((resolve) => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const settle = (result: ToolApprovalResult) => {
                if (!this.pending.has(requestId)) return; // already settled by another path
                this.pending.delete(requestId);
                if (timeoutId) clearTimeout(timeoutId);
                signal?.removeEventListener('abort', onAbort);
                this.log(`Request ${requestId} for ${skillName} settled: ${result.message}`);
                streamEmitter('report_tool_approval_result', { requestId, approved: result.approved, message: result.message });
                resolve(result);
            };

            function onAbort() {
                settle({ approved: false, message: TOOL_APPROVAL_MESSAGES.aborted });
            }

            this.pending.set(requestId, { settle });
            signal?.addEventListener('abort', onAbort, { once: true });

            const request: IToolApprovalRequest = { requestId, skillName, description, payload, timeoutMs };
            streamEmitter('request_tool_approval', request);

            timeoutId = setTimeout(() => {
                this.log(`Request ${requestId} for ${skillName} timed out after ${timeoutMs}ms`);
                settle({ approved: false, message: TOOL_APPROVAL_MESSAGES.timedOut });
            }, timeoutMs);
        });
    }

    /**
     * Answer an open request - called by the approval card in the chat history.
     * Returns false when the request is unknown or already settled.
     */
    respond(requestId: string, approved: boolean): boolean {
        const pending = this.pending.get(requestId);
        if (!pending) return false;
        pending.settle({ approved, message: approved ? TOOL_APPROVAL_MESSAGES.approved : TOOL_APPROVAL_MESSAGES.rejected });
        return true;
    }

    /** Whether a request is still waiting on the user */
    isPending(requestId: string): boolean {
        return this.pending.has(requestId);
    }
}

export default new ToolApprovalManager();
