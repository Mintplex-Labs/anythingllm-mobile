import { useMemo, useRef, useEffect, useState } from "react";
import { FlatList } from "react-native";
import { type WorkspaceType } from "@/database/models/Workspace";
import { type WorkspaceThreadType } from "@/database/models/WorkspaceThread";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";
import useWorkspaceThreadChats from "@/hooks/useWorkspaceThreadChats";
import UserAssistantPair from "./Messages";
import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";

export interface DynamicChatMessage extends Partial<WorkspaceChatType> {
    isLoading?: boolean; // indicates if the message is in the process of being generated. Does not exist in the db record.
}

interface ChatHistoryProps {
    workspace: WorkspaceType;
    thread: WorkspaceThreadType;
}

export default function ChatHistory({ thread }: ChatHistoryProps) {
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();
    const { chats, isLoading, error } = useWorkspaceThreadChats(thread);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const promptInputHeight = useMemo(() => (screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100), []);
    const chatHistoryHeight = useMemo(() => promptInputHeight - (65 + insets.top + 13), [insets.top]);

    const scrollToEnd = () => {
        if (flatListRef.current && chats.length > 0 && !userHasScrolled) {
            flatListRef.current.scrollToOffset({
                offset: screenDimensions.height + (chatHistoryHeight * 0.35),
                animated: true
            });
        }
    };

    return (
        <FlatList
            ref={flatListRef}
            style={{ height: chatHistoryHeight, paddingTop: 20, paddingHorizontal: 10 }}
            contentContainerStyle={{ paddingBottom: screenDimensions.height * 0.35 }}
            showsVerticalScrollIndicator={false}
            data={chats}
            keyExtractor={(item) => item.uuid!}
            renderItem={({ item }) => <UserAssistantPair chat={item} />}
            onScrollEndDrag={() => setUserHasScrolled(true)}
            onLayout={scrollToEnd}
        />
    )
}