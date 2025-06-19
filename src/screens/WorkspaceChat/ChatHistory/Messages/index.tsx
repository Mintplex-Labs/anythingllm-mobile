import UserMessage from "./User";
import AssistantMessage from "./Assistant";
import { View } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";

export default function UserAssistantPair({ chat }: { chat: DynamicChatMessage }) {
    return (
        <View style={{ gap: 20 }} className="flex flex-col items-start w-full">
            <UserMessage prompt={chat.prompt} />
            <AssistantMessage chat={chat} />
        </View>
    )
}