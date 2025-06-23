import { screenDimensions } from "@/utils/constants";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useChatHandlerContext } from "@/hooks/useChatHandler";

const defaultMessages = ['Search the web for AnythingLLM', 'Hello, how are you?', 'What is the transfomer model for AI?', 'Explain the tower of hanoi algorithm'];
export default function EmptyList({ height }: { height: number }) {
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            {defaultMessages.map((message) => <DefaultMessage key={message} text={message} />)}
        </View>
    )
}

export function EmptyListLoading({ height }: { height: number }) {
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            <ActivityIndicator size="large" color="#888" />
            <Text style={{ color: '#888' }} className='text-center'>Loading chat history...</Text>
        </View>
    )
}

function DefaultMessage({ text, }: { text: string }) {
    const chatHandler = useChatHandlerContext();
    function onPress() { chatHandler.setPrompt(text, true); }
    return (
        <TouchableOpacity onPress={onPress} style={{ width: screenDimensions.width / 1.6, paddingVertical: 10, paddingHorizontal: 8 }} className="bg-white/10 rounded-lg">
            <Text className='text-white text-center'>{text}</Text>
        </TouchableOpacity>
    )
}