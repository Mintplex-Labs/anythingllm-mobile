import { generateUUID } from "@/utils/constants";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { type IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import {
    type IActivityNode,
    type IAgentAction,
    type IAgentToolCall,
    type IChatCitation,
    type IThoughtActivity,
    type IToolCallActivity,
    type WorkspaceChatResponseType,
} from "@/database/models/WorkspaceChat";
import { contentIsNotEmpty, parseJSONResponseType, parseThoughtContent } from "./parser";

export type ApplyEventResult = {
    /** Something visible changed and the UI should re-render */
    changed: boolean;
    /** Skip the throttle window and flush right away (turn boundaries, errors) */
    immediate: boolean;
}

/**
 * Mutable working state for one in-flight assistant turn.
 *
 * The chat handler feeds every stream event through `applyEvent`, which records the
 * ordered activity timeline (thoughts, statuses, tool calls) with wall-clock stamps
 * and buffers streamed text. Text is only parsed for think-tags when the UI asks for
 * a `snapshot()`, so the regex passes over the accumulated reply run once per UI
 * flush rather than once per token.
 *
 * Nothing in here touches React state - the handler decides when to publish a
 * snapshot to the chat list. Kept free of React so it stays unit-testable.
 */
export default class AssistantTurn {
    readonly chat: DynamicChatMessage;
    private accumulator = '';
    private textDirty = false;
    /** uuid of the thought node currently being streamed for this LLM round, if any */
    private streamingThoughtUuid: string | null = null;

    constructor(chat: DynamicChatMessage) {
        this.chat = chat;
        if (!this.chat.response) this.chat.response = AssistantTurn.emptyResponse();
        if (!this.chat.response.activity) this.chat.response.activity = [];
        this.chat.isLoading = true;
    }

    static emptyResponse(): WorkspaceChatResponseType {
        return {
            textResponse: '',
            thoughts: [],
            toolCalls: [],
            actions: [],
            metrics: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, outputTps: 0, duration: 0 },
            attachments: [],
            citations: [],
            activity: [],
        };
    }

    get response(): WorkspaceChatResponseType {
        return this.chat.response as WorkspaceChatResponseType;
    }

    get activity(): IActivityNode[] {
        return this.response.activity as IActivityNode[];
    }

    get uuid(): string {
        return this.chat.uuid as string;
    }

    /**
     * Stamps `endedAt` on thought/status nodes that are still open. Tool calls are
     * left alone - they close when their result arrives so their duration reflects
     * the actual execution time even when statuses are reported while they run.
     */
    private closeOpenNodes(at: number = Date.now()) {
        for (const node of this.activity) {
            if (node.type === 'toolCall') continue;
            if (!node.endedAt) node.endedAt = at;
        }
    }

    private appendNode<T extends IActivityNode>(node: T): T {
        const now = Date.now();
        this.closeOpenNodes(now);
        if (!node.startedAt) node.startedAt = now;
        this.activity.push(node);
        return node;
    }

    /**
     * Applies a single stream event to the working state.
     */
    applyEvent(event: IStreamEvent, data: any): ApplyEventResult {
        switch (event) {
            case 'chunk': {
                if (typeof data !== 'string' || data.length === 0) return { changed: false, immediate: false };
                this.accumulator += data;
                this.textDirty = true;
                return { changed: true, immediate: false };
            }
            case 'report_status': {
                const content = String(data ?? '').trim();
                if (!content) return { changed: false, immediate: false };
                this.appendNode({ type: 'status', uuid: generateUUID(), content });
                return { changed: true, immediate: true };
            }
            case 'report_in_progress_thought': {
                const content = String(data ?? '').trim();
                if (!content) return { changed: false, immediate: false };
                this.appendNode({ type: 'thought', uuid: generateUUID(), content });
                return { changed: true, immediate: true };
            }
            case 'will_call_tools': {
                // A new LLM round is about to start. Whatever the model said before deciding to
                // call a tool ("Let me look that up") is not the answer - keep it in the chain as
                // commentary so it is not lost, then reset the text buffer for the next round.
                this.parseText();
                const commentary = this.response.textResponse?.trim();
                if (commentary) this.appendNode({ type: 'thought', uuid: generateUUID(), content: commentary });
                this.response.textResponse = '';
                this.accumulator = '';
                this.textDirty = false;
                this.streamingThoughtUuid = null;
                this.closeOpenNodes();
                return { changed: true, immediate: true };
            }
            case 'report_tool_call': {
                const call = data as IAgentToolCall;
                if (!call?.uuid || !call.signature) return { changed: false, immediate: false };
                this.appendNode({ type: 'toolCall', uuid: call.uuid, signature: call.signature, result: '' });
                return { changed: true, immediate: true };
            }
            case 'report_tool_call_result': {
                const call = data as IAgentToolCall;
                const node = this.activity.find((n): n is IToolCallActivity => n.type === 'toolCall' && n.uuid === call?.uuid);
                if (!node) return { changed: false, immediate: false };
                node.result = call.result ?? '';
                node.endedAt = Date.now();
                return { changed: true, immediate: true };
            }
            case 'report_citations': {
                const incoming = Array.isArray(data) ? (data as IChatCitation[]) : [];
                if (!incoming.length) return { changed: false, immediate: false };
                this.response.citations = [...(this.response.citations || []), ...incoming];
                return { changed: true, immediate: false };
            }
            case 'report_action': {
                if (!data) return { changed: false, immediate: false };
                this.response.actions = [...(this.response.actions || []), data as IAgentAction];
                return { changed: true, immediate: false };
            }
            case 'report_metrics': {
                if (data) this.response.metrics = data as WorkspaceChatResponseType['metrics'];
                return { changed: false, immediate: false };
            }
            case 'complete': {
                this.parseText();
                this.closeOpenNodes();
                this.chat.isLoading = false;
                return { changed: true, immediate: true };
            }
            case 'timed_out': {
                this.fail('The request timed out before a response was received. Connection may be lost.');
                return { changed: true, immediate: true };
            }
            case 'abort':
                throw new Error('Chat aborted');
            default:
                return { changed: false, immediate: false };
        }
    }

    /**
     * Marks the turn as failed. The error text replaces the visible reply; the
     * activity recorded so far is kept so the user can see how far it got.
     */
    fail(message: string) {
        this.parseText();
        this.closeOpenNodes();
        this.chat.type = 'error';
        this.chat.isLoading = false;
        this.response.textResponse = message || 'Error processing chat';
    }

    /**
     * Splits the buffered reply into reasoning + visible text. Reasoning goes into the
     * streaming thought node for this round (created on first sight); visible text
     * becomes `textResponse`. Once visible text exists the chain is considered settled.
     */
    parseText() {
        if (!this.textDirty) return;
        this.textDirty = false;

        const parsed = parseThoughtContent(this.accumulator);
        const mainContent = parseJSONResponseType(parsed.mainContent);

        if (contentIsNotEmpty(parsed.reasoningContent)) {
            let node = this.streamingThoughtUuid
                ? this.activity.find((n): n is IThoughtActivity => n.type === 'thought' && n.uuid === this.streamingThoughtUuid)
                : undefined;
            if (!node) {
                node = this.appendNode({ type: 'thought', uuid: generateUUID(), content: '' });
                this.streamingThoughtUuid = node.uuid;
            }
            node.content = parsed.reasoningContent;
            if (!parsed.isThinking && !node.endedAt) node.endedAt = Date.now();
        }

        this.response.textResponse = mainContent;
        if (mainContent.trim().length > 0) this.closeOpenNodes();
    }

    /**
     * Immutable copy safe to hand to React. Nodes are copied so memoised rows can
     * compare by value without being affected by later in-place mutation.
     */
    snapshot(): DynamicChatMessage {
        this.parseText();
        return {
            ...this.chat,
            response: {
                ...this.response,
                activity: this.activity.map((node) => ({ ...node })),
            },
        };
    }

    /**
     * Final shape written to the database. Also back-fills the legacy `thoughts` /
     * `toolCalls` arrays from the timeline so older readers keep working.
     */
    finalize(): DynamicChatMessage {
        this.parseText();
        this.closeOpenNodes();
        this.chat.isLoading = false;

        const response = this.response;
        response.thoughts = this.activity
            .filter((n): n is IThoughtActivity => n.type === 'thought')
            .map((n) => n.content);
        response.toolCalls = this.activity
            .filter((n): n is IToolCallActivity => n.type === 'toolCall')
            .map(({ uuid, signature, result }) => ({ uuid, signature, result }));
        delete response.currentThoughtChain;
        delete response.isLoading;

        return this.snapshot();
    }
}
