import { memo } from "react";
import { View } from "react-native";
import UserMessage from "./User";
import AssistantMessage from "./Assistant";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";

/**
 * One row of the chat list. Memoised on the chat snapshot so a stream flush
 * only re-renders the row that is actually changing.
 */
export default memo(function UserAssistantPair({ chat }: { chat: DynamicChatMessage }) {
    return (
        <View style={{ gap: 20 }} className="flex flex-col items-start w-full">
            <UserMessage chat={chat} />
            <AssistantMessage chat={chat} />
        </View>
    )
});
