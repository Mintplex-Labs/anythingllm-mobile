import { memo } from "react";
import { View } from "react-native";
import UserMessage from "./User";
import AssistantMessage from "./Assistant";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import ErrorBoundary, { MessageErrorFallback, type ErrorFallbackProps } from "@/components/ErrorBoundary";

const renderMessageFallback = ({ error }: ErrorFallbackProps) => <MessageErrorFallback error={error} />;

/**
 * One row of the chat list. Memoised on the chat snapshot so a stream flush
 * only re-renders the row that is actually changing.
 * A row that fails to render shows a placeholder instead of breaking the whole thread.
 */
export default memo(function UserAssistantPair({ chat }: { chat: DynamicChatMessage }) {
    return (
        <ErrorBoundary name="chat-message" fallback={renderMessageFallback}>
            <View style={{ gap: 20 }} className="flex flex-col items-start w-full">
                <UserMessage chat={chat} />
                <AssistantMessage chat={chat} />
            </View>
        </ErrorBoundary>
    )
});
