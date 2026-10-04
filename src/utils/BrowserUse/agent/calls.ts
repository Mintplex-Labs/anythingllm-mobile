import { generateUUID } from '@/utils/constants';
import { safeJsonParse } from '@/utils/formatters';
import { type ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import { type ToolCall } from './types';

/** Reading the model's tool calls, and making calls on its behalf (a blocker pause, a progress check's "go back"). */

/** An OpenAI-style tool call id - providers need one to pair a call with its result */
export function newCallId() {
    return `call_${generateUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** A call the agent loop makes itself, recorded as if the model had made it */
export function syntheticCall(name: string, args: Record<string, any>): ToolCall {
    return { name, args, raw: { id: newCallId(), name, arguments: JSON.stringify(args) } };
}

/**
 * The model's first tool call. Models that answer with a JSON action in plain text instead
 * (`text`, thinking already stripped) are understood too. Null when there is no call at all.
 */
export function callFromResponse(response: ICompleteResponse, text: string): ToolCall | null {
    const toolCall = response.toolCalls?.[0];
    if (toolCall?.function?.name) {
        const raw = {
            id: toolCall.id || newCallId(),
            name: toolCall.function.name,
            arguments: typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments : JSON.stringify(toolCall.function.arguments ?? {}),
            ...(toolCall.extra_content ? { extra_content: toolCall.extra_content } : {}),
        };
        return { name: raw.name, args: normalizeArgs(toolCall.function.arguments), raw };
    }
    const parsed = parseJsonAction(text);
    return parsed ? syntheticCall(parsed.name, parsed.args) : null;
}

/** Pull a {"tool": ..., "args": ...} action out of a plain-text reply (stray text calls). */
export function parseJsonAction(text = ''): { name: string; args: Record<string, any> } | null {
    const cleaned = String(text).replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = safeJsonParse(cleaned.slice(start, end + 1), null);
    if (!obj || typeof obj !== 'object') return null;
    const name = obj.tool || obj.name || obj.action || obj.function;
    if (typeof name !== 'string') return null;
    return { name, args: normalizeArgs(obj.args ?? obj.arguments ?? obj.parameters ?? obj.input ?? {}) };
}

function normalizeArgs(args: unknown): Record<string, any> {
    if (typeof args === 'string') return safeJsonParse(args, {}) || {};
    return args && typeof args === 'object' ? (args as Record<string, any>) : {};
}
