import { memo, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TouchableOpacity, View } from "react-native";
import { CaretDown, Hammer } from "phosphor-react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { type IToolApprovalActivity } from "@/database/models/WorkspaceChat";
import ToolApproval from "@/utils/ToolsManager/toolApproval";

/**
 * Native port of the desktop `ToolApprovalRequest` card
 * (frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ToolApprovalRequest).
 *
 * Shows while a tool in the current turn is waiting on the user's consent: what the model
 * wants to call, why, the (expandable) arguments, approve / reject buttons and a bar that
 * drains toward the timeout. Answering hands the decision to `ToolApprovalManager`, which
 * settles the tool's promise and reports the result back into the turn - at which point
 * the node stops being pending and this card gives way to the step in the activity chain.
 *
 * Only pending requests on a live turn render. A node left pending on a reloaded chat
 * (the app was closed mid-request) has nobody waiting on it, so nothing is shown.
 */
export default memo(function ToolApprovalRequest({ chat }: { chat: DynamicChatMessage }) {
    if (!chat.isLoading) return null;
    const pending = (chat.response?.activity ?? []).filter((node): node is IToolApprovalActivity => node.type === 'toolApproval' && node.approved === null);
    if (pending.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {pending.map((node) => <ToolApprovalCard key={node.requestId} node={node} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 */
    card: '#27272A',
    /** zinc-700 */
    track: '#3F3F46',
    /** zinc-900 @ 50% */
    payload: 'rgba(24,24,27,0.5)',
    /** zinc-300 */
    payloadText: '#D4D4D8',
    /** sky-500 */
    progress: '#0EA5E9',
    /** sky-400 */
    skill: '#38BDF8',
    text: 'rgba(255,255,255,0.8)',
    muted: 'rgba(255,255,255,0.6)',
} as const;

function ToolApprovalCard({ node }: { node: IToolApprovalActivity }) {
    const [isExpanded, setIsExpanded] = useState(false);
    // Guard against a double tap landing before the settled snapshot arrives.
    const [responded, setResponded] = useState(false);
    const hasPayload = !!node.payload && Object.keys(node.payload).length > 0;

    const respond = (approved: boolean) => {
        if (responded) return;
        setResponded(true);
        ToolApproval.respond(node.requestId, approved);
    };

    return (
        <View style={{ width: '100%', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, paddingBottom: 12, gap: 6, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                    <Hammer size={16} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '500', flexShrink: 1 }}>
                        Model wants to call <Text style={{ color: COLORS.skill, fontWeight: '600' }}>{node.skillName}</Text>
                    </Text>
                </View>
                {hasPayload && (
                    <Pressable
                        onPress={() => setIsExpanded((v) => !v)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? 'Hide details' : 'Show details'}
                        style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                    >
                        <CaretDown size={16} color={COLORS.text} />
                    </Pressable>
                )}
            </View>

            {!!node.description && (
                <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 16, fontFamily: 'monospace', fontWeight: '500' }}>{node.description}</Text>
            )}

            {hasPayload && isExpanded && (
                <View style={{ backgroundColor: COLORS.payload, borderRadius: 8, padding: 12 }}>
                    <Text style={{ color: COLORS.payloadText, fontSize: 12, lineHeight: 16, fontFamily: 'monospace' }}>{formatPayload(node.payload)}</Text>
                </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, paddingBottom: 8 }}>
                <TouchableOpacity
                    activeOpacity={0.6}
                    disabled={responded}
                    onPress={() => respond(true)}
                    style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, opacity: responded ? 0.6 : 1 }}
                >
                    <Text style={{ color: '#000000', fontSize: 14 }}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    activeOpacity={0.6}
                    disabled={responded}
                    onPress={() => respond(false)}
                    style={{ width: 70, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', opacity: responded ? 0.6 : 1 }}
                >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>Reject</Text>
                </TouchableOpacity>
            </View>

            {!responded && <TimeoutBar timeoutMs={node.timeoutMs} startedAt={node.startedAt} />}
        </View>
    );
}

/**
 * Drains from full to empty over the request's lifetime - the desktop `useTimeoutProgress`
 * bar. Anchored to the node's own start stamp so a re-mount (list recycling, tab switch)
 * picks up mid-way instead of restarting. The timeout itself is owned by the approval
 * manager; this is display only.
 */
function TimeoutBar({ timeoutMs, startedAt }: { timeoutMs: number; startedAt?: number }) {
    const [trackWidth, setTrackWidth] = useState(0);
    const progress = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!timeoutMs) return;
        const elapsed = startedAt ? Date.now() - startedAt : 0;
        const remaining = Math.max(0, timeoutMs - elapsed);
        progress.setValue(remaining / timeoutMs);
        const animation = Animated.timing(progress, { toValue: 0, duration: remaining, useNativeDriver: true });
        animation.start();
        return () => animation.stop();
    }, [timeoutMs, startedAt, progress]);

    if (!timeoutMs) return null;
    return (
        <View
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: COLORS.track, overflow: 'hidden' }}
        >
            {/* scaleX shrinks around the center, so slide left by half the lost width to keep it anchored at the left edge */}
            <Animated.View
                style={{
                    height: '100%',
                    width: '100%',
                    backgroundColor: COLORS.progress,
                    transform: [
                        { translateX: Animated.multiply(Animated.subtract(progress, 1), trackWidth / 2) },
                        { scaleX: progress },
                    ],
                }}
            />
        </View>
    );
}

function formatPayload(payload: IToolApprovalActivity['payload']): string {
    if (typeof payload === 'string') return payload;
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return String(payload);
    }
}
