import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { FlatList, RefreshControl, TouchableNativeFeedbackComponent, TouchableOpacity, View } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";
import UserAssistantPair from "./Messages";
import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";
import EmptyList, { EmptyListLoading } from "./EmptyList";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler/index";
import uiStore from "@/store/UIStore";
import { Gesture, TapGestureHandler } from "react-native-gesture-handler";

export interface DynamicChatMessage extends Partial<WorkspaceChatType> {
    type?: 'message' | 'error'
    isLoading?: boolean; // indicates if the message is in the process of being generated. Does not exist in the db record.
}

export default function ChatHistory() {
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();
    const chatHandler = useChatHandlerContext();
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const promptInputHeight = useMemo(() => (screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100), []);
    const chatHistoryHeight = useMemo(() => promptInputHeight - (65 + insets.top + 13), [insets.top]);

    const scrollToTop = () => {
        if (!flatListRef.current) return;
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    };

    const scrollToEnd = () => {
        if (!flatListRef.current) return;
        flatListRef.current.scrollToOffset({
            offset: screenDimensions.height + (chatHistoryHeight * 0.35),
            animated: true
        });
    };

    const onLayout = useCallback(() => {
        if (chatHandler.chats.length === 0) scrollToTop();
        else scrollToEnd();
    }, [chatHandler.chats.length]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        chatHandler.fetchChats().finally(() => setRefreshing(false));
        setUserHasScrolled(false);
    }, [chatHandler.fetchChats]);

    useEffect(() => {
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.RESET_CHAT, scrollToTop);
        return () => uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.RESET_CHAT);
    }, []);

    useEffect(() => {
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.CHAT_SCROLL_EVENT, () => {
            if (!flatListRef.current || userHasScrolled) return;
            flatListRef.current.scrollToOffset({
                offset: screenDimensions.height + (chatHistoryHeight * 0.35),
                animated: true
            });
        });
        return () => uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.CHAT_SCROLL_EVENT);
    }, [userHasScrolled]);

    return (
        <FlatList
            ref={flatListRef}
            style={{ height: chatHistoryHeight, paddingTop: 20, paddingHorizontal: 10 }}
            contentContainerStyle={{ paddingBottom: screenDimensions.height * 0.35, display: 'flex', flexDirection: 'column', gap: 20 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={chatHandler.canScrollChatHistory}
            data={chatHandler.chats}
            keyExtractor={(item) => item.uuid!}
            renderItem={({ item }) => <UserAssistantPair chat={item} />}
            ListEmptyComponent={chatHandler.isLoadingChats ? <EmptyListLoading height={chatHistoryHeight} /> : <EmptyList height={chatHistoryHeight} />}
            // If touched while the chat is in a working state, break the scroll focus
            onTouchStart={() => { if (chatHandler.isWorking) setUserHasScrolled(true) }}
            // If the chat is not in a working state, reset the scroll focus when the user scrolls to the end
            onEndReached={() => { if (!chatHandler.promptDisabled) setUserHasScrolled(false) }}
            onLayout={onLayout}
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