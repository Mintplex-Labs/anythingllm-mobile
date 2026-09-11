import { useMemo, useRef, useState, useCallback } from "react";
import { FlatList, RefreshControl, View, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent, TouchableOpacity, ListRenderItem } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";
import UserAssistantPair from "./Messages";
import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";
import EmptyList, { EmptyListLoading } from "./EmptyList";
import { CHAT_HANDLER_EVENTS, useChatHistoryContext } from "@/hooks/useChatHandler/index";
import uiStore from "@/store/UIStore";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import { ArrowDown } from "phosphor-react-native";
import { ActivityExpansionProvider } from "./Messages/Assistant/ActivityChain/ExpansionContext";

export interface DynamicChatMessage extends Partial<WorkspaceChatType> {
    type?: 'message' | 'error'
    isLoading?: boolean; // indicates if the message is in the process of being generated. Does not exist in the db record.
}

/** Distance from the end (px) within which the list still counts as "at the bottom" */
const AT_BOTTOM_THRESHOLD = 40;
/** Fallback to clear the "programmatic scroll in flight" flag if no momentum-end event arrives. */
const PROGRAMMATIC_SCROLL_TIMEOUT_MS = 600;

const keyExtractor = (item: DynamicChatMessage) => item.uuid!;
const renderItem: ListRenderItem<DynamicChatMessage> = ({ item }) => <UserAssistantPair chat={item} />;

export default function ChatHistory() {
    const flatListRef = useRef<FlatList<DynamicChatMessage>>(null);
    const contentHeight = useRef(0);
    const viewHeight = useRef(0);
    const isAtBottomRef = useRef(true);
    // True while an animated scroll-to-end we triggered is in flight. Scroll events emitted
    // mid-animation would otherwise flip the button back on before the list lands.
    const programmaticScrollRef = useRef(false);
    const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const insets = useSafeAreaInsets();
    // Only the history slice of the handler - typing in the prompt must not re-render the list.
    const { chats, isLoadingChats, canScrollChatHistory, isWorking, fetchChats } = useChatHistoryContext();
    const [refreshing, setRefreshing] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const keyboardHeight = useKeyboardHeight();
    const promptInputHeight = useMemo(() => (screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100), []);
    const chatHistoryHeight = useMemo(() => promptInputHeight - (65 + insets.top + 13), [insets.top]);
    const promptInputContainerHeight = useMemo(() => screenDimensions.height - promptInputHeight, [promptInputHeight]);
    const footerHeight = useMemo(() => {
        return promptInputContainerHeight + 20;
    }, [promptInputContainerHeight]);

    // Padding lives on the content container (not the list's own style) so the scroll viewport
    // reported by scroll events matches the view height we measure - otherwise the "at bottom"
    // math is off by the padding and the jump-to-bottom button never dismisses.
    const contentContainerStyle = useMemo(() => {
        return {
            paddingTop: 20,
            paddingHorizontal: 10,
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom,
        }
    }, [keyboardHeight, insets.bottom]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        fetchChats().finally(() => setRefreshing(false));
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS);
        uiStore.emitter.emit(uiStore.globalEvents.CHAT_HISTORY_REFRESHED);
    }, [fetchChats]);

    const setAtBottom = useCallback((atBottom: boolean) => {
        if (atBottom === isAtBottomRef.current) return;
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
    }, []);

    const clearProgrammaticScroll = useCallback(() => {
        programmaticScrollRef.current = false;
        if (programmaticScrollTimer.current) {
            clearTimeout(programmaticScrollTimer.current);
            programmaticScrollTimer.current = null;
        }
    }, []);

    /** Follow the stream: only nudges the list when the user is already pinned to the bottom. */
    const followBottom = useCallback(() => {
        if (!isAtBottomRef.current) return;
        const offset = contentHeight.current - viewHeight.current;
        if (offset > 0) flatListRef.current?.scrollToOffset({ animated: false, offset });
    }, []);

    /** User tapped the arrow: jump to the end and dismiss the button immediately. */
    const jumpToBottom = useCallback(() => {
        clearProgrammaticScroll();
        programmaticScrollRef.current = true;
        programmaticScrollTimer.current = setTimeout(clearProgrammaticScroll, PROGRAMMATIC_SCROLL_TIMEOUT_MS);
        setAtBottom(true);
        flatListRef.current?.scrollToEnd({ animated: true });
    }, [clearProgrammaticScroll, setAtBottom]);

    const evaluateScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        // The scroll event knows the true viewport size - keep our ref in sync with it.
        if (layoutMeasurement.height > 0) viewHeight.current = layoutMeasurement.height;
        return layoutMeasurement.height + contentOffset.y >= contentSize.height - AT_BOTTOM_THRESHOLD;
    }, []);

    const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const atBottom = evaluateScroll(event);
        if (programmaticScrollRef.current) {
            // Ignore the intermediate frames of our own animation; once it lands, resume normal tracking.
            if (atBottom) clearProgrammaticScroll();
            return;
        }
        setAtBottom(atBottom);
    }, [evaluateScroll, setAtBottom, clearProgrammaticScroll]);

    // Settled positions (finger lifted / momentum finished / our scrollToEnd landed) are authoritative.
    const handleScrollSettled = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        clearProgrammaticScroll();
        setAtBottom(evaluateScroll(event));
    }, [evaluateScroll, setAtBottom, clearProgrammaticScroll]);

    // Fires on every stream flush while a reply grows - keep it to a ref write + one native scroll call.
    const handleContentSizeChange = useCallback((_width: number, height: number) => {
        contentHeight.current = height;
        followBottom();
    }, [followBottom]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
        viewHeight.current = e.nativeEvent.layout.height;
    }, []);

    const listFooter = useMemo(() => <View style={{ height: footerHeight }} />, [footerHeight]);
    const listEmpty = useMemo(
        () => (isLoadingChats ? <EmptyListLoading height={chatHistoryHeight} /> : <EmptyList height={chatHistoryHeight} />),
        [isLoadingChats, chatHistoryHeight]
    );

    return (
        <ActivityExpansionProvider>
            <FlatList
                ref={flatListRef}
                style={{ flex: 1 }}
                contentContainerStyle={contentContainerStyle}
                showsVerticalScrollIndicator={false}
                scrollEnabled={canScrollChatHistory}
                data={chats}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ListEmptyComponent={listEmpty}
                ListFooterComponent={listFooter}
                onContentSizeChange={handleContentSizeChange}
                onLayout={handleLayout}
                onScroll={handleScroll}
                onScrollEndDrag={handleScrollSettled}
                onMomentumScrollEnd={handleScrollSettled}
                scrollEventThrottle={32}
                // Rows are tall and markdown-heavy: keep fewer offscreen rows mounted than the
                // default 21 viewports while still leaving a comfortable buffer either side.
                windowSize={7}
                maxToRenderPerBatch={6}
                updateCellsBatchingPeriod={40}
                refreshControl={
                    <RefreshControl
                        enabled={!isWorking}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#FFF"
                        colors={["#000"]}
                    />
                }
            />

            {!isAtBottom && chats.length > 0 && (
                <TouchableOpacity
                    onPress={jumpToBottom}
                    style={{ bottom: promptInputContainerHeight + 15 }}
                    className="absolute self-center border border-white/20 bg-black/50 w-10 h-10 rounded-full justify-center items-center z-10"
                >
                    <ArrowDown size={22} color="white" />
                </TouchableOpacity>
            )}
        </ActivityExpansionProvider>
    )
}
