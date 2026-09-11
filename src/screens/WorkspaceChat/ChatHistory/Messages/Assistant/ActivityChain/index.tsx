import { memo, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Brain, Check, Hammer, X, Wrench } from "phosphor-react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { type IActivityNode, type IToolApprovalActivity, type IToolCallActivity } from "@/database/models/WorkspaceChat";
import {
    CHAIN_COLORS,
    CHAIN_SMALL_TEXT,
    CHAIN_TEXT,
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    ChainOfThoughtStep,
    type ChainStepStatus,
} from "./ChainOfThought";
import { useActivityExpansion } from "./ExpansionContext";
import { chainDurationSeconds, chainHeaderLabel, deriveActivity, formatDuration, nodeDurationSeconds } from "./utils";

/** Thought steps clamp to this many lines until tapped */
const THOUGHT_COLLAPSED_LINES = 8;
/** Tool results clamp to this many lines until tapped */
const RESULT_COLLAPSED_LINES = 3;

/**
 * One rolled-up activity chain for an assistant turn - the mobile counterpart of
 * the desktop `StatusResponse`. Every thought the model produced, every status a
 * tool reported and every tool call collapses into a single expandable block
 * headed by what is happening right now (or how long it all took).
 *
 * While the turn is still generating and nothing visible has arrived yet the
 * chain is "active": the header shimmers with the latest status and the last
 * step is highlighted. As soon as reply text starts streaming the chain settles.
 */
export default memo(function ActivityChain({ chat }: { chat: DynamicChatMessage }) {
    const response = chat.response;
    const nodes = useMemo(() => deriveActivity(response), [response]);
    const { expanded, setExpanded } = useActivityExpansion(chat.uuid);

    const hasVisibleText = !!response?.textResponse?.trim();
    const active = !!chat.isLoading && !hasVisibleText && chat.type !== 'error';
    if (nodes.length === 0 && !active) return null;

    const lastNode = nodes[nodes.length - 1];
    // Mid-thought is a thought node that has not been stamped closed yet.
    const thinkingActive = active && (nodes.length === 0 || (lastNode.type === 'thought' && !lastNode.endedAt));
    // Live without a streaming thought - eg: a tool is executing with no new status yet.
    const workingActive = active && !thinkingActive;

    const totalDuration = chainDurationSeconds(nodes, active);
    const chainEndedAt = active ? null : nodes.reduce<number | null>((max, n) => {
        const end = n.endedAt ?? n.startedAt ?? 0;
        return end > (max ?? 0) ? end : max;
    }, null);
    const headerLabel = chainHeaderLabel({ nodes, thinkingActive, workingActive, totalDuration });
    const hasWorkNodes = nodes.some((n) => n.type !== 'thought');

    return (
        <ChainOfThought open={expanded} onOpenChange={setExpanded} disabled={nodes.length === 0}>
            <ChainOfThoughtHeader
                icon={<ActivityIcon active={active} thinking={thinkingActive || !hasWorkNodes} hasWorkNodes={hasWorkNodes} />}
                pending={active}
                label={headerLabel}
            />
            <ChainOfThoughtContent>
                {nodes.map((node, index) => (
                    <ActivityStep
                        key={node.uuid || `activity-${index}`}
                        node={node}
                        status={active && index === nodes.length - 1 ? 'active' : 'complete'}
                        isLast={index === nodes.length - 1}
                        seconds={nodeDurationSeconds(node, nodes[index + 1], chainEndedAt)}
                    />
                ))}
            </ChainOfThoughtContent>
        </ChainOfThought>
    );
});

function ActivityIcon({ active, thinking, hasWorkNodes }: { active: boolean; thinking: boolean; hasWorkNodes: boolean }) {
    // Thought states use the same brain glyph as the expanded thought steps; the
    // shimmering header label already signals activity while thinking.
    if (active && thinking) return <Brain size={20} color={CHAIN_COLORS.muted} />;
    if (active) return <ActivityIndicator size="small" color={CHAIN_COLORS.muted} />;
    if (hasWorkNodes) return <Wrench size={20} color={CHAIN_COLORS.muted} />;
    return <Brain size={20} color={CHAIN_COLORS.muted} />;
}

/**
 * Routes a node to the right step renderer. Only primitives are passed down so
 * the memoised steps skip re-rendering when a flush did not touch them.
 */
function ActivityStep({ node, status, isLast, seconds }: { node: IActivityNode; status: ChainStepStatus; isLast: boolean; seconds: number | null }) {
    const duration = seconds ? formatDuration(seconds) : undefined;
    switch (node.type) {
        case 'thought':
            return <ThoughtStep content={node.content} status={status} isLast={isLast} duration={duration} />;
        case 'toolCall':
            return <ToolCallStep signature={node.signature} result={node.result} status={status} isLast={isLast} duration={duration} />;
        case 'toolApproval':
            return <ToolApprovalStep skillName={node.skillName} approved={node.approved} message={node.message} status={status} isLast={isLast} duration={duration} />;
        default:
            return <ChainOfThoughtStep label={node.content} status={status} isLast={isLast} description={duration} />;
    }
}

const ThoughtStep = memo(function ThoughtStep({ content, status, isLast, duration }: { content: string; status: ChainStepStatus; isLast: boolean; duration?: string }) {
    const [showAll, setShowAll] = useState(false);
    const color = status === 'active' ? CHAIN_COLORS.active : status === 'pending' ? CHAIN_COLORS.pending : CHAIN_COLORS.muted;
    return (
        <ChainOfThoughtStep
            icon={Brain}
            status={status}
            isLast={isLast}
            description={duration}
            label={
                <Pressable onPress={() => setShowAll((v) => !v)}>
                    <Text style={[CHAIN_TEXT, { color }]} numberOfLines={showAll ? undefined : THOUGHT_COLLAPSED_LINES}>
                        {content.trim()}
                    </Text>
                </Pressable>
            }
        />
    );
});

const ToolCallStep = memo(function ToolCallStep({ signature, result, status, isLast, duration }: Pick<IToolCallActivity, 'signature' | 'result'> & { status: ChainStepStatus; isLast: boolean; duration?: string }) {
    const [showAll, setShowAll] = useState(false);
    const running = !result;
    return (
        <ChainOfThoughtStep
            icon={Wrench}
            status={status}
            isLast={isLast}
            label={
                <Text style={[CHAIN_TEXT, { color: status === 'active' ? CHAIN_COLORS.active : CHAIN_COLORS.muted, fontFamily: 'monospace', fontSize: 13 }]} numberOfLines={showAll ? undefined : 2}>
                    {signature}
                </Text>
            }
            description={duration}
        >
            {running ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color={CHAIN_COLORS.muted} style={{ transform: [{ scale: 0.7 }] }} />
                    <Text style={[CHAIN_SMALL_TEXT, { color: CHAIN_COLORS.muted }]}>Running</Text>
                </View>
            ) : (
                <Pressable onPress={() => setShowAll((v) => !v)}>
                    <Text
                        style={[CHAIN_SMALL_TEXT, { color: CHAIN_COLORS.muted, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: CHAIN_COLORS.rail }]}
                        numberOfLines={showAll ? undefined : RESULT_COLLAPSED_LINES}
                    >
                        {result.trim()}
                    </Text>
                </Pressable>
            )}
        </ChainOfThoughtStep>
    );
});

/** Approval colors mirror the desktop card: sky for the skill, green approved, red rejected */
const APPROVAL_COLORS = { approved: '#4ADE80', rejected: '#F87171' } as const;

/**
 * Compact record of a consent request. While the user has not answered, the
 * full approve/reject card renders outside the chain (see `ToolApprovalRequest`)
 * so this step only needs to say the turn is waiting.
 */
const ToolApprovalStep = memo(function ToolApprovalStep({ skillName, approved, message, status, isLast, duration }: Pick<IToolApprovalActivity, 'skillName' | 'approved' | 'message'> & { status: ChainStepStatus; isLast: boolean; duration?: string }) {
    const pending = approved === null;
    const color = status === 'active' ? CHAIN_COLORS.active : CHAIN_COLORS.muted;
    const label = pending
        ? `Waiting for approval to run ${skillName}`
        : approved ? `Approved ${skillName}` : `Rejected ${skillName}`;
    return (
        <ChainOfThoughtStep
            icon={Hammer}
            status={status}
            isLast={isLast}
            label={<Text style={[CHAIN_TEXT, { color }]}>{label}</Text>}
            description={duration}
        >
            {pending ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color={CHAIN_COLORS.muted} style={{ transform: [{ scale: 0.7 }] }} />
                    <Text style={[CHAIN_SMALL_TEXT, { color: CHAIN_COLORS.muted }]}>Waiting for you</Text>
                </View>
            ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {approved ? <Check size={14} color={APPROVAL_COLORS.approved} weight="bold" /> : <X size={14} color={APPROVAL_COLORS.rejected} weight="bold" />}
                    <Text style={[CHAIN_SMALL_TEXT, { color: approved ? APPROVAL_COLORS.approved : APPROVAL_COLORS.rejected, flexShrink: 1 }]}>
                        {message || (approved ? 'Tool call was approved' : 'Tool call was rejected')}
                    </Text>
                </View>
            )}
        </ChainOfThoughtStep>
    );
});
