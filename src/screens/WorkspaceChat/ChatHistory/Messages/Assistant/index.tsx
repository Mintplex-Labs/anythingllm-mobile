import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Warning } from "phosphor-react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { BASE_MESSAGE_STYLES } from "./styles";
import ActivityChain from "./ActivityChain";
import CitationsContainer from "./Citations";
import ActionsContainer from "./Actions";
import TextResponseContainer from "./TextResponse";
import { focusMessageActions } from "../focusMessageActions";

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
    const hasTrailingChips = !!response?.actions?.length || (!!response?.citations?.length && !chat.isLoading);
    return (
        <View className="flex flex-col items-start w-full justify-start" style={{ gap: 11, paddingBottom: hasTrailingChips ? TRAILING_CHIPS_BOTTOM_PADDING : 0 }}>
            <ActivityChain chat={chat} />
            {chat.type === 'error' ? (
                <ErrorContainer message={response?.textResponse} onLongPress={handleLongPress} />
            ) : (
                <TextResponseContainer uuid={chat.uuid} textResponse={response?.textResponse} metrics={response?.metrics} onLongPress={handleLongPress} />
            )}
            <ActionsContainer actions={response?.actions} />
            <CitationsContainer citations={response?.citations} isLoading={chat.isLoading} />
        </View>
    );
});

function ErrorContainer({ message, onLongPress }: { message?: string; onLongPress?: () => void }) {
    if (!message) return null;
    return (
        <View className="flex flex-row items-start w-full justify-start">
            <TouchableOpacity
                onLongPress={onLongPress}
                delayLongPress={500}
                activeOpacity={0.7}
                className="rounded-lg flex flex-row items-center"
                style={[BASE_MESSAGE_STYLES, { gap: 4, borderWidth: 1, borderColor: '#F97066', maxWidth: '100%', backgroundColor: 'rgba(122,39,26,0.2)' }]}>
                <Warning size={18} color="#F97066" />
                <Text style={{ color: '#F97066', flexShrink: 1 }} className="text-lg">{message}</Text>
            </TouchableOpacity>
        </View>
    );
}
