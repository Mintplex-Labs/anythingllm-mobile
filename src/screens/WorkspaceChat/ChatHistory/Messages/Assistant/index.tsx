import { ActivityIndicator, Text, View, ViewStyle } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { BASE_MESSAGE_STYLES } from "./styles";
import ThinkingContainer from "./ThinkingContainer";
import ToolCallContainer from "./ToolCallContainer";
import CitationsContainer from "./Citations";

function hasNothingToShow(chat: DynamicChatMessage): boolean {
    if (!chat.isLoading) return false;
    return (
        !chat.response?.textResponse?.length &&
        !chat.response?.thoughts?.length &&
        !chat.response?.toolCalls?.length
    );
}

export default function AssistantMessage({ chat }: { chat: DynamicChatMessage }) {
    if (hasNothingToShow(chat)) return <EmptyLoadingMessage />;

    return (
        <View className="flex flex-col items-start w-full justify-start" style={{ gap: 11 }}>
            <ToolCallContainer chat={chat} />
            <ThinkingContainer chat={chat} />
            <TextResponseContainer chat={chat} />
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

function TextResponseContainer({ chat }: { chat: DynamicChatMessage }) {
    const textResponse = chat.response?.textResponse;
    if (!textResponse) return null;

    return (
        <View className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg" style={[BASE_MESSAGE_STYLES, { maxWidth: '100%' }]}>
                <Text>{chat.response?.textResponse}</Text>
            </View>
        </View>
    )
}