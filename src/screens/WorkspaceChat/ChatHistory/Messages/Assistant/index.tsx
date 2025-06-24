import { ActivityIndicator, Text, View } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { BASE_MESSAGE_STYLES } from "./styles";
import ThinkingContainer from "./ThinkingContainer";
import ToolCallContainer from "./ToolCallContainer";
import CitationsContainer from "./Citations";
import ActionsContainer from "./Actions";
import { Warning } from "phosphor-react-native";
import useChatListeners from "./useChatListeners";
import TextResponseContainer from "./TextResponse";

function hasNothingToShow(chat: DynamicChatMessage): boolean {
    if (!chat.isLoading) return false;
    return (
        !chat.response?.textResponse?.length &&
        !chat.response?.thoughts?.length &&
        !chat.response?.toolCalls?.length
    );
}

export default function AssistantMessage(props: { chat: DynamicChatMessage }) {
    const { chat, autoClose } = useChatListeners(props.chat);
    if (hasNothingToShow(chat)) return <EmptyLoadingMessage />;
    if (chat.type === 'error') return <ErrorContainer chat={chat} />;

    return (
        <View className="flex flex-col items-start w-full justify-start" style={{ gap: 11 }}>
            <ToolCallContainer chat={chat} autoClose={autoClose} />
            <ThinkingContainer chat={chat} autoClose={autoClose} />
            <TextResponseContainer chat={chat} />
            <ActionsContainer chat={chat} />
            <CitationsContainer chat={chat} />
        </View>
    )
}

function EmptyLoadingMessage() {
    return (
        <View className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg" style={[BASE_MESSAGE_STYLES]}>
                <ActivityIndicator size="large" color="white" />
            </View>
        </View>
    )
}

function ErrorContainer({ chat }: { chat: DynamicChatMessage }) {
    const textResponse = chat.response?.textResponse;
    if (!textResponse) return null;

    return (
        <View className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg flex flex-row items-center" style={[BASE_MESSAGE_STYLES, { gap: 4, borderWidth: 1, borderColor: '#F97066', maxWidth: '100%', backgroundColor: 'rgba(122,39,26,0.2)' }]}>
                <Warning size={18} color="#F97066" />
                <Text style={{ color: '#F97066' }} className="text-lg">{chat.response?.textResponse}</Text>
            </View>
        </View>
    )
}