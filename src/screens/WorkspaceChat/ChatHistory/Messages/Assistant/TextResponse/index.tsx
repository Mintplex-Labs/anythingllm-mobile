import { View } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { markdownRules } from "./rules";
MarkdownIt({ typographer: true, linkify: true });

export default function TextResponseContainer({ chat }: { chat: DynamicChatMessage }) {
    const textResponse = chat.response?.textResponse;
    if (!textResponse) return null;

    return (
        <View className="flex flex-row items-start w-full justify-start">
            <Markdown rules={markdownRules}>{chat.response?.textResponse}</Markdown>
        </View>
    )
}