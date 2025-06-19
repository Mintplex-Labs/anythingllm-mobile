import { Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { useState } from "react";
import { Brain, CaretUp } from "phosphor-react-native";
import { BASE_MESSAGE_STYLES } from "../styles";

const THINKING_STYLES: Record<string, ViewStyle | TextStyle> = {
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

export default function ThinkingContainer({ chat }: { chat: DynamicChatMessage }) {
    const [isExpanded, setIsExpanded] = useState(chat.isLoading);

    const thoughts = chat.response?.thoughts;
    if (!thoughts) return null;

    if (!isExpanded) {
        return (
            <TouchableOpacity onPress={() => setIsExpanded(true)} className="flex flex-row items-start w-full justify-start">
                <View className="rounded-lg flex flex-row w-full items-center justify-between" style={[THINKING_STYLES.completed]}>
                    <View className="flex flex-row items-center gap-2">
                        {/* @ts-ignore */}
                        <Brain size={20} color={THINKING_STYLES.text.color} />
                        <Text numberOfLines={1} ellipsizeMode="tail" style={[THINKING_STYLES.text, { maxWidth: '85%' }]}>{thoughts.split('\n').join(' ')}</Text>
                    </View>

                    {/* @ts-ignore */}
                    <CaretUp size={20} color={THINKING_STYLES.text.color} />
                </View>
            </TouchableOpacity>
        )
    }

    return (
        <TouchableOpacity onPress={() => setIsExpanded(false)} className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg w-full" style={[THINKING_STYLES[chat.isLoading ? 'loading' : 'completed']]}>
                <Text style={[THINKING_STYLES.text]}>{thoughts}</Text>
            </View>
        </TouchableOpacity>
    )
}