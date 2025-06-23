import { FlatList, Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { useEffect, useState } from "react";
import { Brain, CaretUp } from "phosphor-react-native";
import { BASE_MESSAGE_STYLES } from "../styles";
import { contentIsNotEmpty } from "@/hooks/useChatHandler/parser";

const THINKING_STYLES: Record<string, ViewStyle & TextStyle> = {
    loading: {
        ...BASE_MESSAGE_STYLES,
        borderStyle: 'solid',
        borderColor: 'rgba(178,221,255,0.4)',
    },
    completed: {
        ...BASE_MESSAGE_STYLES,
        borderStyle: 'dashed',
        borderColor: 'rgba(178,221,255,0.4)',
    },
    icons: {
        color: 'rgba(178,221,255,0.4)',
    },
    text: {
        color: '#B2DDFF',
    }
}

export default function ThinkingContainer({ chat, autoClose }: { chat: DynamicChatMessage, autoClose: boolean }) {
    const [isExpanded, setIsExpanded] = useState(chat.isLoading);
    const thoughts = chat.response?.thoughts.filter(thought => contentIsNotEmpty(thought)) || [];

    useEffect(() => {
        if (autoClose) setIsExpanded(false);
    }, [autoClose]);

    if (!thoughts.length) return null;

    if (!isExpanded) {
        return (
            <TouchableOpacity onPress={() => setIsExpanded(true)} className="flex flex-row items-start w-full justify-start">
                <View className="rounded-lg flex flex-row w-full items-center justify-between" style={[THINKING_STYLES.completed]}>
                    <View className="flex flex-row items-center gap-2">
                        {/* @ts-ignore */}
                        <Brain size={20} color={THINKING_STYLES.text.color} />
                        <Text numberOfLines={1} ellipsizeMode="tail" style={[THINKING_STYLES.text, { maxWidth: '85%' }]}>{thoughts[0]?.split('\n').join(' ')}</Text>
                    </View>

                    {/* @ts-ignore */}
                    <CaretUp size={20} color={THINKING_STYLES.text.color} />
                </View>
            </TouchableOpacity>
        )
    }

    return (
        <TouchableOpacity activeOpacity={1} onPress={() => setIsExpanded(false)} className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg w-full" style={[THINKING_STYLES[chat.isLoading ? 'loading' : 'completed']]}>
                <FlatList
                    data={thoughts}
                    className='w-full'
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 10 }}
                    scrollEnabled={false}
                    renderItem={({ item }) => <Text style={[THINKING_STYLES.text]}>{item}</Text>}
                    keyExtractor={(_, index) => index.toString()}
                    ItemSeparatorComponent={() => (
                        <View style={{ paddingVertical: 10, position: 'relative', opacity: 0.75 }} className="w-full flex flex-row items-center justify-center w-full">
                            <View style={{ height: 1, backgroundColor: THINKING_STYLES.text.color, borderRadius: 100, }} className='flex flex-1 w-full' />
                            <Text style={{ fontSize: 12, color: THINKING_STYLES.text.color, paddingHorizontal: 10, zIndex: 2 }} className='text-white text-sm'>Thinking Continued...</Text>
                            <View style={{ height: 1, backgroundColor: THINKING_STYLES.text.color, borderRadius: 100, }} className='flex flex-1 w-full' />
                        </View>
                    )}
                />
            </View>
        </TouchableOpacity>
    )
}