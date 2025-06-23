import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { Text, TouchableOpacity } from "react-native";
import uiStore from "@/store/UIStore";

export default function CitationsContainer({ chat }: { chat: DynamicChatMessage }) {
    const citations = chat.response?.citations;
    if (!citations?.length || chat.isLoading) return null;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => uiStore.emitter.emit(uiStore.globalEvents.CITATIONS_FOCUSED, citations)}
            className="flex flex-row items-start justify-start rounded-full"
            style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6 }}
        >
            <Text style={{ color: '#7CD4FD' }} className="text-sm">View Citations</Text>
        </TouchableOpacity >
    )
}