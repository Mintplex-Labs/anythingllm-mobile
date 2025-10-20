import { useMemo, useRef, useState, useCallback } from "react";
import { FlatList, RefreshControl, View, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent, TouchableOpacity } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";
import UserAssistantPair from "./Messages";
import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";
import EmptyList, { EmptyListLoading } from "./EmptyList";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler/index";
import uiStore from "@/store/UIStore";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import { ArrowDown } from "phosphor-react-native";

export interface DynamicChatMessage extends Partial<WorkspaceChatType> {
    type?: 'message' | 'error'
    isLoading?: boolean; // indicates if the message is in the process of being generated. Does not exist in the db record.
}

export default function ChatHistory() {
    const flatListRef = useRef<FlatList>(null);
    const contentHeight = useRef(0);
    const viewHeight = useRef(0);
    const insets = useSafeAreaInsets();
    const chatHandler = useChatHandlerContext();
    const [refreshing, setRefreshing] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const keyboardHeight = useKeyboardHeight();
    const promptInputHeight = useMemo(() => (screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100), []);
    const chatHistoryHeight = useMemo(() => promptInputHeight - (65 + insets.top + 13), [insets.top]);
    const promptInputContainerHeight = useMemo(() => screenDimensions.height - promptInputHeight, [promptInputHeight]);
    const footerHeight = useMemo(() => {
        return promptInputContainerHeight + 20;
    }, [promptInputContainerHeight]);

    const contentContainerStyle = useMemo(() => {
        return {
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom,
        }
    }, [keyboardHeight, insets.bottom]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        chatHandler.fetchChats().finally(() => setRefreshing(false));
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS);
        uiStore.emitter.emit(uiStore.globalEvents.CHAT_HISTORY_REFRESHED);
    }, [chatHandler.fetchChats]);

    const scrollToBottom = (animated: boolean = true, force: boolean = false) => {
        if (!force && !isAtBottom) return;
        const offset = contentHeight.current - viewHeight.current;
        if (offset > 0) {
            flatListRef.current?.scrollToOffset({ animated, offset });
        }
    };

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isScrolledToBottom =
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
        setIsAtBottom(isScrolledToBottom);
    };

    const handleContentSizeChange = (width: number, height: number) => {
        contentHeight.current = height;
        scrollToBottom(false);
    };

    return (
        <>
        <FlatList
            ref={flatListRef}
            style={{ flex: 1, paddingTop: 20, paddingHorizontal: 10 }}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={false}
            scrollEnabled={chatHandler.canScrollChatHistory}
            data={chatHandler.chats}
            keyExtractor={(item) => item.uuid!}
            renderItem={({ item }) => <UserAssistantPair chat={item} />}
            ListEmptyComponent={chatHandler.isLoadingChats ? <EmptyListLoading height={chatHistoryHeight} /> : <EmptyList height={chatHistoryHeight} />}
            ListFooterComponent={<View style={{ height: footerHeight }} />}
            onContentSizeChange={handleContentSizeChange}
            onLayout={(e: LayoutChangeEvent) => {
                viewHeight.current = e.nativeEvent.layout.height;
            }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
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

            {!isAtBottom && chatHandler.chats.length > 0 && (
                <TouchableOpacity
                    onPress={() => scrollToBottom(true, true)}
                    style={{ bottom: promptInputContainerHeight + 15 }}
                    className="absolute self-center border border-white/20 bg-black/50 w-10 h-10 rounded-full justify-center items-center z-10"
                >
                    <ArrowDown size={22} color="white" />
                </TouchableOpacity>
            )}
            </>
    )
}