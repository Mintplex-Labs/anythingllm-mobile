import { type IActivityNode, type WorkspaceChatResponseType } from "@/database/models/WorkspaceChat";
import { contentIsNotEmpty, stripThoughtTags } from "@/hooks/useChatHandler/parser";

/**
 * Mirrors `formatDuration` from the desktop frontend (utils/numbers.js).
 * @param duration - seconds
 */
export function formatDuration(duration: number): string {
    try {
        if (!Number.isFinite(duration) || duration < 0) return "";
        if (duration < 1) return `${(duration * 1000).toFixed(0)}ms`;
        if (duration < 60) return `${duration.toFixed(1)}s`;
        if (duration < 3600) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            return `${minutes}m ${seconds}s`;
        }
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = Math.floor(duration % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    } catch {
        return "";
    }
}

/**
 * Returns the activity timeline for a response. Rows written before the
 * timeline existed only have `toolCalls` + `thoughts`, so rebuild an ordered
 * list from those (tool calls first, then thoughts - the order the old UI
 * displayed them in). Timestamps are unknown for those so no durations show.
 */
export function deriveActivity(response?: Partial<WorkspaceChatResponseType> | null): IActivityNode[] {
    if (!response) return [];
    if (Array.isArray(response.activity)) return response.activity;

    const nodes: IActivityNode[] = [];
    for (const call of response.toolCalls ?? []) {
        if (!call?.signature) continue;
        nodes.push({ type: 'toolCall', uuid: call.uuid || `legacy-tool-${nodes.length}`, signature: call.signature, result: call.result ?? '' });
    }
    (response.thoughts ?? []).forEach((thought, index) => {
        if (!contentIsNotEmpty(thought)) return;
        nodes.push({ type: 'thought', uuid: `legacy-thought-${index}`, content: stripThoughtTags(thought) });
    });
    return nodes;
}

/**
 * Seconds a node was active for. Runs to the node's own end stamp, else to the
 * next node's start, else (once the chain has settled) to the chain's end.
 */
export function nodeDurationSeconds(node: IActivityNode, next: IActivityNode | undefined, chainEndedAt: number | null): number | null {
    if (!node.startedAt) return null;
    const end = node.endedAt ?? next?.startedAt ?? chainEndedAt ?? null;
    if (!end || end <= node.startedAt) return null;
    return (end - node.startedAt) / 1000;
}

/**
 * Wall-clock span of the whole chain, or null while it is still working or
 * when it was loaded without timestamps.
 */
export function chainDurationSeconds(nodes: IActivityNode[], active: boolean): number | null {
    if (active || nodes.length === 0) return null;
    const start = nodes[0].startedAt;
    if (!start) return null;
    let end = 0;
    for (const node of nodes) {
        if (node.endedAt && node.endedAt > end) end = node.endedAt;
        else if (node.startedAt && node.startedAt > end) end = node.startedAt;
    }
    if (end <= start) return null;
    return (end - start) / 1000;
}

/** `web_search(query: cats)` -> `web_search` */
export function toolNameFromSignature(signature: string): string {
    const index = signature.indexOf('(');
    return (index === -1 ? signature : signature.slice(0, index)).trim() || signature;
}

/**
 * Header text for the rolled-up chain (desktop `thoughtLabel` + StatusResponse
 * header rules).
 */
export function chainHeaderLabel({
    nodes,
    thinkingActive,
    workingActive,
    totalDuration,
}: {
    nodes: IActivityNode[];
    thinkingActive: boolean;
    workingActive: boolean;
    totalDuration: number | null;
}): string {
    if (thinkingActive) return 'Thinking...';
    if (workingActive) {
        const last = nodes[nodes.length - 1];
        if (last?.type === 'toolApproval' && last.approved === null) return 'Waiting for your approval';
        if (last?.type === 'status') return last.content;
        if (last?.type === 'toolCall') return `Calling ${toolNameFromSignature(last.signature)}`;
        return 'Working...';
    }
    if (totalDuration) {
        const didWork = nodes.some((n) => n.type !== 'thought');
        return `${didWork ? 'Worked' : 'Thought'} for ${formatDuration(totalDuration)}`;
    }
    return 'Thoughts';
}
