import { ActivityIndicator, Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { useState, useEffect } from "react";
import { Hammer } from "phosphor-react-native";
import { BASE_MESSAGE_STYLES } from "../styles";
import { IAgentToolCall } from "@/database/models/WorkspaceChat";

const TOOL_CALL_STYLES: Record<string, ViewStyle & TextStyle> = {
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

export default function ToolCallContainer({ chat, autoClose }: { chat: DynamicChatMessage, autoClose: boolean }) {
    const [isExpanded, setIsExpanded] = useState(chat.isLoading);
    const toolCalls = chat.response?.toolCalls;

    useEffect(() => {
        if (autoClose) setIsExpanded(false);
    }, [autoClose]);
    if (!toolCalls?.length) return null;

    if (!isExpanded) {
        const toolCallCount = toolCalls.length - 1;
        return (
            <TouchableOpacity onPress={() => setIsExpanded(true)} className="flex flex-row items-start w-full justify-start">
                <View className="rounded-lg flex flex-row w-full items-center justify-between" style={[TOOL_CALL_STYLES.completed]}>
                    <View className="flex flex-row items-center gap-2 flex-1">
                        {/* @ts-ignore */}
                        <Hammer size={20} color={TOOL_CALL_STYLES.text.color} />
                        <Text numberOfLines={1} ellipsizeMode="tail" style={[TOOL_CALL_STYLES.text, { flex: 1, maxWidth: '85%' }]}>
                            {toolCalls[0].signature} - {toolCalls[0].result}
                        </Text>
                    </View>

                    {/* @ts-ignore */}
                    {toolCallCount > 0 ? (
                        <View className="flex flex-row items-center justify-center">
                            <Text style={[TOOL_CALL_STYLES.text, { fontSize: 12 }]}>+ {toolCallCount}</Text>
                        </View>
                    ) : <View />}
                </View>
            </TouchableOpacity >
        )
    }

    return (
        <TouchableOpacity onPress={() => setIsExpanded(false)} className="flex flex-row items-start w-full justify-start">
            <View className="rounded-lg w-full flex flex-col" style={[TOOL_CALL_STYLES[chat.isLoading ? 'loading' : 'completed'], { gap: 5 }]}>
                {toolCalls.map((toolCall, index) => <RenderExpandedToolCall key={index} toolCall={toolCall} />)}
            </View>
        </TouchableOpacity>
    )
}

function RenderExpandedToolCall({ toolCall }: { toolCall: IAgentToolCall }) {
    return (
        <View className="flex flex-row items-center justify-between w-full">
            {toolCall.result && (
                <View className="flex flex-col justify-start items-start">
                    <Text style={[TOOL_CALL_STYLES.text]}>{toolCall.signature}</Text>
                    <Text style={[TOOL_CALL_STYLES.text, { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(178,221,255,0.4)' }]}>{toolCall.result}</Text>
                </View>
            )}
            {!toolCall.result && (
                <View className="flex flex-row items-center gap-2">
                    {/* @ts-ignore */}
                    <ActivityIndicator size='small' color={TOOL_CALL_STYLES.text.color} />
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[TOOL_CALL_STYLES.text, { flex: 1, maxWidth: '85%' }]} className="font-semibold">{toolCall.signature}:</Text>
                </View>
            )}
        </View>
    )
}