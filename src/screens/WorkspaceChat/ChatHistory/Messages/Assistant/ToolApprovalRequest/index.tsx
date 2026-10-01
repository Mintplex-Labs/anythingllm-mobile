import { memo, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TouchableOpacity, View } from "react-native";
import { CaretDown, Check, ShieldCheck } from "phosphor-react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { type IToolApprovalActivity } from "@/database/models/WorkspaceChat";
import ToolApproval from "@/utils/ToolsManager/toolApproval";
import ToolsManager from "@/utils/ToolsManager";
import { useTranslation } from "react-i18next";

/**
 * Native port of the desktop `ToolApprovalRequest` card
 * (frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ToolApprovalRequest).
 *
 * Shows while a tool in the current turn is waiting on the user's consent: what the model
 * wants to run, why, the (expandable) arguments, approve / reject buttons, an "always approve"
 * checkbox and a bar that drains toward the timeout. Answering hands the decision to
 * `ToolApprovalManager`, which settles the tool's promise and reports the result back into the
 * turn - at which point the node stops being pending and this card gives way to the step in the
 * activity chain. Ticking "always approve" makes later requests for the tool skip this card
 * (removable from Settings > Utility > Tool auto-approvals).
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
    /** zinc-800 - same surface as the other chat cards */
    card: '#27272A',
    iconChip: '#3F3F46',
    /** zinc-700 */
    track: '#3F3F46',
    /** zinc-900 */
    payload: '#18181B',
    /** zinc-300 */
    payloadText: '#D4D4D8',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    /** Same blue as the other chat cards */
    accent: '#84CAFF',
    /** zinc-500 */
    checkboxBorder: '#71717A',
} as const;

function ToolApprovalCard({ node }: { node: IToolApprovalActivity }) {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [alwaysApprove, setAlwaysApprove] = useState(false);
    // Guard against a double tap landing before the settled snapshot arrives.
    const [responded, setResponded] = useState(false);
    const hasPayload = !!node.payload && Object.keys(node.payload).length > 0;
    const toolName = ToolsManager.displayNameFor(node.skillName);

    const respond = (approved: boolean) => {
        if (responded) return;
        setResponded(true);
        ToolApproval.respond(node.requestId, approved, { always: approved && alwaysApprove });
    };

    return (
        <View style={{ width: '100%', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, overflow: 'hidden' }}>
            {/* Header - same layout as the reminder / file download cards */}
            <View className="flex flex-row items-center" style={{ gap: 12 }}>
                <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                    <ShieldCheck size={22} color={COLORS.accent} />
                </View>
                <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: COLORS.text }} className="text-base font-medium">{toolName}</Text>
                    <Text numberOfLines={1} style={{ color: COLORS.accent }} className="text-xs font-medium">{t('chat.tool_approval.needs_approval')}</Text>
                </View>
            </View>

            {!!node.description && (
                <Text style={{ color: COLORS.muted, lineHeight: 20 }} className="text-sm">{node.description}</Text>
            )}

            {hasPayload && (
                <View style={{ gap: 8 }}>
                    <Pressable
                        onPress={() => setIsExpanded((v) => !v)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isExpanded }}
                        className="flex flex-row items-center self-start"
                        style={{ gap: 4 }}
                    >
                        <Text style={{ color: COLORS.muted }} className="text-xs font-medium">
                            {isExpanded ? t('chat.tool_approval.hide_details') : t('chat.tool_approval.show_details')}
                        </Text>
                        <View style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}>
                            <CaretDown size={12} color={COLORS.muted} weight="bold" />
                        </View>
                    </Pressable>
                    {isExpanded && (
                        <View style={{ backgroundColor: COLORS.payload, borderRadius: 8, padding: 12 }}>
                            <Text style={{ color: COLORS.payloadText, fontSize: 12, lineHeight: 16, fontFamily: 'monospace' }}>{formatPayload(node.payload)}</Text>
                        </View>
                    )}
                </View>
            )}

            <Pressable
                onPress={() => setAlwaysApprove((v) => !v)}
                disabled={responded}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alwaysApprove, disabled: responded }}
                className="flex flex-row items-center self-start"
                style={{ gap: 8 }}
            >
                <View
                    style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        borderWidth: alwaysApprove ? 0 : 1.5,
                        borderColor: COLORS.checkboxBorder,
                        backgroundColor: alwaysApprove ? COLORS.accent : 'transparent',
                    }}
                    className="flex items-center justify-center"
                >
                    {alwaysApprove && <Check size={12} color="#000000" weight="bold" />}
                </View>
                <Text style={{ color: COLORS.text }} className="text-sm">{t('chat.tool_approval.always_approve')}</Text>
            </Pressable>

            <View className="flex flex-row" style={{ gap: 8, marginBottom: 4 }}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={responded}
                    onPress={() => respond(false)}
                    style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: COLORS.iconChip, opacity: responded ? 0.5 : 1 }}
                    className="flex items-center justify-center"
                >
                    <Text style={{ color: COLORS.text }} className="text-sm font-medium">{t('chat.tool_approval.reject')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={responded}
                    onPress={() => respond(true)}
                    style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: '#FFFFFF', opacity: responded ? 0.5 : 1 }}
                    className="flex items-center justify-center"
                >
                    <Text style={{ color: '#000000' }} className="text-sm font-medium">{t('chat.tool_approval.approve')}</Text>
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
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: COLORS.track, overflow: 'hidden' }}
        >
            {/* scaleX shrinks around the center, so slide left by half the lost width to keep it anchored at the left edge */}
            <Animated.View
                style={{
                    height: '100%',
                    width: '100%',
                    backgroundColor: COLORS.accent,
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
