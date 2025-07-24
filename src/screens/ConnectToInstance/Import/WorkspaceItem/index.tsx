import Workspace from "@/database/models/Workspace";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import { WorkspaceChatType } from "@/database/models/WorkspaceChat";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import { parseThinkingParts } from "@/utils/chat";
import { generateUUID } from "@/utils/constants";
import { formatNumber, safeJsonParse } from "@/utils/formatters";
import { showToast } from "@/utils/Notification";
import { CheckCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { syncFromRemote } from "./sync";
// import Document, { DocumentType } from "@/database/models/Document";
// import getEmbedder from "@/utils/Embedder";
// import VectorDB from "@/utils/VectorDB";

type IStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface WorkspaceItemProps {
    module: AnythingLLMExternal;
    workspace: CommandResponses['workspaces']['workspaces'][number];
}

export default function WorkspaceItem({ module, workspace }: WorkspaceItemProps) {
    const [status, setStatus] = useState<IStatus>('idle');

    // Reset status after 5 seconds if there is an error so they can try again
    useEffect(() => {
        if (status === 'error') setTimeout(() => { setStatus('idle') }, 5000);
    }, [status]);

    return (
        <View className="flex flex-row justify-between w-full">
            <View className="flex flex-col items-start gap-2">
                <Text className="text-white text-lg font-medium">{workspace.name}</Text>
                <Text className="text-white text-sm">{formatNumber(workspace.threadCount + 1)} threads / {formatNumber(workspace.chatCount)} chats</Text>
                <Text className="text-white text-sm">{formatNumber(workspace.documentCount)} documents</Text>
            </View>
            <TouchableOpacity
                onPress={() => syncFromRemote({ module, workspace, setStatus })}
                disabled={status !== 'idle'}
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', width: 100, height: 40 }} className="flex flex-row items-center justify-center gap-2 px-4 py-1 rounded-full disabled:opacity-50">
                {status === 'syncing' && (
                    <View className="flex flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#FFF" />
                        <Text className="text-white font-medium">Importing...</Text>
                    </View>
                )}
                {status === 'synced' && (
                    <View className="flex flex-row items-center gap-2">
                        <CheckCircle size={24} color="#FFF" />
                        <Text className="text-white font-medium">Imported!</Text>
                    </View>
                )}
                {status === 'error' && <Text className="text-red-500 font-medium">Error</Text>}
                {status === 'idle' && <Text className="text-white font-medium">Import</Text>}
            </TouchableOpacity>
        </View>
    );
}