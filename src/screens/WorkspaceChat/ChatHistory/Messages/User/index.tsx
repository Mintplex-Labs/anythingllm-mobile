import { type WorkspaceChatType } from "@/database/models/WorkspaceChat";
import { Text, View } from "react-native";

export default function UserMessage({ prompt }: Partial<WorkspaceChatType>) {
    return (
        <View className="flex flex-row items-start w-full justify-end">
            <View className="bg-white/10 rounded-lg" style={{ maxWidth: '95%', paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text className="text-white text-right">{prompt}</Text>
            </View>
        </View>
    )
}
