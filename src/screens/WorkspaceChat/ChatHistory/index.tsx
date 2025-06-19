import { useMemo } from "react";
import { Text, ScrollView, View } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "../PromptInput";

export default function ChatHistory() {
    const insets = useSafeAreaInsets();
    const chatHistoryHeight = useMemo(() => screenDimensions.height * (100 - parseFloat(snapPointsDefault[0])) / 100 - (65 + insets.top + 13), [insets.top])
    return (
        <ScrollView style={{ maxHeight: chatHistoryHeight, paddingTop: 20 }} contentContainerClassName="flex-1 flex flex-col items-center justify-center">
            <Text className="text-white">Chat History goes here</Text>
        </ScrollView>
    )
}