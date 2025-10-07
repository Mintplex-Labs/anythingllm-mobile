import { useMemo, useRef, useState, useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";
import UserAssistantPair from "./Messages";
import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";
import EmptyList, { EmptyListLoading } from "./EmptyList";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler/index";
import uiStore from "@/store/UIStore";

export interface DynamicChatMessage extends Partial<WorkspaceChatType> {
    type?: 'message' | 'error'
    isLoading?: boolean; // indicates if the message is in the process of being generated. Does not exist in the db record.
}

export default function ChatHistory() {
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();
    const chatHandler = useChatHandlerContext();
    const [refreshing, setRefreshing] = useState(false);
    const promptInputHeight = useMemo(() => (screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100), []);
    const chatHistoryHeight = useMemo(() => promptInputHeight - (65 + insets.top + 13), [insets.top]);
    const promptInputContainerHeight = useMemo(() => screenDimensions.height - promptInputHeight, [promptInputHeight]);
    const footerHeight = useMemo(() => {
        return promptInputContainerHeight + 20;
    }, [promptInputContainerHeight]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        chatHandler.fetchChats().finally(() => setRefreshing(false));
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS);
        uiStore.emitter.emit(uiStore.globalEvents.CHAT_HISTORY_REFRESHED);
    }, [chatHandler.fetchChats]);

    const scrollToBottom = (animated: boolean = true) => {
        // Using large offset is more reliable than using scrollToEnd
        flatListRef.current?.scrollToOffset({ animated, offset: 999999 });
    };

    return (
        <FlatList
            ref={flatListRef}
            style={{ height: chatHistoryHeight, paddingTop: 20, paddingHorizontal: 10 }}
            contentContainerStyle={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={chatHandler.canScrollChatHistory}
            data={chatHandler.chats}
            keyExtractor={(item) => item.uuid!}
            renderItem={({ item }) => <UserAssistantPair chat={item} />}
            ListEmptyComponent={chatHandler.isLoadingChats ? <EmptyListLoading height={chatHistoryHeight} /> : <EmptyList height={chatHistoryHeight} />}
            ListFooterComponent={<View style={{ height: footerHeight }} />}
            onContentSizeChange={() => scrollToBottom(true)}
            onLayout={() => scrollToBottom(false)}
            refreshControl={
                <RefreshControl
                    enabled={!chatHandler.promptDisabled}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#FFF"
                    colors={["#000"]}
                />
            }
        />
    )
}