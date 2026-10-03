import { memo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { WarningCircle } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import ActivityChain from "./ActivityChain";
import CitationsContainer from "./Citations";
import ActionsContainer from "./Actions";
import FileDownloadCards from "./FileDownloadCard";
import ScheduledJobCreatedCards from "./ScheduledJobCreatedCard";
import ReminderCards from "./ReminderCard";
import { CalendarEventCards, EmailDraftCards, TextDraftCards } from "./DraftCards";
import TextResponseContainer from "./TextResponse";
import ToolApprovalRequest from "./ToolApprovalRequest";
import BrowserUseSessionCards from "./BrowserUseSessionCard";
import { focusMessageActions } from "../focusMessageActions";
import { CARD_ACTION_TYPES } from "./Actions";

/**
 * The assistant half of a chat row. Receives the latest snapshot of the chat
 * straight from the list - no per-message event listeners - and is memoised so
 * only the row whose snapshot changed re-renders while a reply streams.
 */
/**
 * The markdown body ends with the library's default paragraph margin (10), which is what
 * normally separates this row from the next user bubble. When actions or citations render
 * below the text they become the last child and have no margin of their own, so the next
 * row sits flush against them - pad the block by the same amount in that case.
 */
const TRAILING_CHIPS_BOTTOM_PADDING = 10;

export default memo(function AssistantMessage({ chat }: { chat: DynamicChatMessage }) {
    const response = chat.response;
    const handleLongPress = () => focusMessageActions(chat, 'assistant');
    // File download cards and citations wait for the reply to finish so streaming text does not keep pushing them down the page.
    const isCardAction = (type: string) => CARD_ACTION_TYPES.includes(type);
    const hasLinkChips = !!response?.actions?.some(action => !isCardAction(action.type));
    // Browser session cards sit above the reply, not below it, so they need no trailing padding.
    const hasDeferredChips = !chat.isLoading && (!!response?.citations?.length || !!response?.actions?.some(action => isCardAction(action.type) && action.type !== 'browser_use_session'));
    const hasTrailingChips = hasLinkChips || hasDeferredChips;
    return (
        <View className="flex flex-col items-start w-full justify-start" style={{ gap: 11, paddingBottom: hasTrailingChips ? TRAILING_CHIPS_BOTTOM_PADDING : 0 }}>
            <ActivityChain chat={chat} />
            <ToolApprovalRequest chat={chat} />
            {/* Live while the browser agent works, so it shows mid-turn instead of waiting for the reply */}
            <BrowserUseSessionCards actions={response?.actions} />
            {/* `type` only lives in memory - a thread reloaded from the database has just the persisted flag */}
            {chat.type === 'error' || response?.error ? (
                <ErrorContainer message={response?.textResponse} onLongPress={handleLongPress} />
            ) : (
                <TextResponseContainer uuid={chat.uuid} textResponse={response?.textResponse} metrics={response?.metrics} onLongPress={handleLongPress} />
            )}
            <FileDownloadCards actions={response?.actions} isLoading={chat.isLoading} />
            <ScheduledJobCreatedCards actions={response?.actions} isLoading={chat.isLoading} />
            <ReminderCards actions={response?.actions} isLoading={chat.isLoading} />
            <TextDraftCards actions={response?.actions} isLoading={chat.isLoading} />
            <EmailDraftCards actions={response?.actions} isLoading={chat.isLoading} />
            <CalendarEventCards actions={response?.actions} isLoading={chat.isLoading} />
            <ActionsContainer actions={response?.actions} />
            <CitationsContainer citations={response?.citations} isLoading={chat.isLoading} />
        </View>
    );
});

const ERROR_COLORS = {
    /** zinc-800 - same surface as the tool approval and file download cards */
    card: '#27272A',
    /** red-400 */
    accent: '#F87171',
    /** red-400 @ 15% */
    badge: 'rgba(248,113,113,0.15)',
    text: '#FFFFFF',
    /** zinc-400 */
    muted: '#A1A1AA',
} as const;

/** Provider errors can be whole JSON dumps - clamp them and let the user expand */
const ERROR_COLLAPSED_LINES = 4;

function ErrorContainer({ message, onLongPress }: { message?: string; onLongPress?: () => void }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [truncatable, setTruncatable] = useState(false);
    if (!message) return null;
    return (
        <TouchableOpacity
            onPress={truncatable ? () => setExpanded(v => !v) : undefined}
            onLongPress={onLongPress}
            delayLongPress={500}
            activeOpacity={0.8}
            accessibilityRole="alert"
            style={{ width: '100%', backgroundColor: ERROR_COLORS.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}
            className="flex flex-row items-start">
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ERROR_COLORS.badge }} className="flex items-center justify-center">
                <WarningCircle size={16} color={ERROR_COLORS.accent} weight="bold" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 4 }}>
                <Text style={{ color: ERROR_COLORS.text, fontSize: 14, fontWeight: '500', lineHeight: 18 }}>{t('errors.boundary.something_went_wrong')}</Text>
                <Text
                    numberOfLines={expanded ? undefined : ERROR_COLLAPSED_LINES}
                    onTextLayout={(e) => { if (!truncatable && e.nativeEvent.lines.length > ERROR_COLLAPSED_LINES) setTruncatable(true); }}
                    style={{ color: ERROR_COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                    {message}
                </Text>
                {truncatable && (
                    <Text style={{ color: ERROR_COLORS.text, fontSize: 12, fontWeight: '500', marginTop: 2 }}>{expanded ? t('chat.errors.show_less') : t('chat.errors.show_more')}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
}
