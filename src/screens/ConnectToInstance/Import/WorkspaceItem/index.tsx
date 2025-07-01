import Document, { DocumentType } from "@/database/models/Document";
import Workspace from "@/database/models/Workspace";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import { WorkspaceChatType } from "@/database/models/WorkspaceChat";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import { parseThinkingParts } from "@/utils/chat";
import { generateUUID } from "@/utils/constants";
import getEmbedder from "@/utils/Embedder";
import { formatNumber, safeJsonParse } from "@/utils/formatters";
import { showToast } from "@/utils/Notification";
import VectorDB from "@/utils/VectorDB";
import { CheckCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

type IStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface WorkspaceItemProps {
    module: AnythingLLMExternal;
    workspace: CommandResponses['get-workspaces']['workspaces'][number];
}

export default function WorkspaceItem({ module, workspace }: WorkspaceItemProps) {
    const [status, setStatus] = useState<IStatus>('idle');

    const handleSync = async () => {
        try {
            setStatus('syncing');
            const { documents, threads, chats } = await module.sendCommand('pull-workspace-content', { workspaceId: workspace.id });

            // Create workspace replica
            const workspaceReplica = await Workspace.directCreate({
                name: workspace.name,
                slug: generateUUID(), // generate a new uuid for the workspace in case it already exists (imported previously)
                systemPrompt: workspace.openAiPrompt,
                temperature: workspace.openAiTemp,
                contextLength: workspace.topN,
            });

            // make all threads - if default thread, generate a new uuid
            // since that is just a placeholder value so we can bridge desktop and mobile
            const threadPromises = [] as Promise<WorkspaceThread>[];
            for (const thread of threads) {
                if (thread.slug === 'default-thread') thread.slug = generateUUID();
                threadPromises.push(
                    WorkspaceThread.directCreate({
                        name: thread.name,
                        slug: thread.slug,
                        workspaceSlug: workspaceReplica.slug,
                    }));
            }
            await Promise.all(threadPromises);

            // make all chats with associated thread and citations
            const chatPromises = [] as Promise<WorkspaceChatType>[];
            for (const chat of chats) {
                const fkThread = threads.find((t) => t.id === chat.thread_id);
                const fkChat = safeJsonParse(chat.response, null);
                const { nonThinkingText, thinkingText } = parseThinkingParts(fkChat.text);
                const sources = fkChat.sources.map((source: any) => {
                    return {
                        type: 'document',
                        document: {
                            uuid: source.id,
                            name: source.title,
                            chunk: source.text,
                            score: source.score,
                        },
                    }
                });

                chatPromises.push(WorkspaceChat.directCreate({
                    workspaceThreadSlug: fkThread?.slug,
                    prompt: chat.prompt,
                    response: {
                        textResponse: nonThinkingText,
                        thoughts: thinkingText ? [thinkingText] : [],
                        toolCalls: [],
                        metrics: {
                            prompt_tokens: fkChat.metrics?.prompt_tokens ?? 0,
                            completion_tokens: fkChat.metrics?.completion_tokens ?? 0,
                            total_tokens: fkChat.metrics?.total_tokens ?? 0,
                            outputTps: fkChat.metrics?.outputTps ?? 0,
                            duration: fkChat.metrics?.duration ?? 0,
                        },
                        attachments: [],
                        citations: sources,
                        currentThoughtChain: [],
                        actions: [],
                        isLoading: false,
                    },
                }));
            }
            await Promise.all(chatPromises);

            // Embed all documents using the native embedder on the device
            // Do this sequentially to avoid overwhelming the device - it will take longer
            // but it will be more reliable and less likely to crash the app
            const embedder = getEmbedder('native');
            const documentReplicas = [] as DocumentType[];
            for (const document of documents) {
                // @ts-ignore
                const metadata = safeJsonParse(document.metadata, null);
                await embedder
                    .splitAndEmbed(document.pageContent, { chunkSize: 2048, chunkOverlap: 20 })
                    .then(embedResults => embedResults.map(embedResult => {
                        const newMetadata = { ...embedResult.metadata, name: metadata?.title ?? 'New Document' };
                        return { embedding: embedResult.embedding, metadata: newMetadata };
                    }))
                    .then(async (embeddings) => await VectorDB.bulkInsert(workspaceReplica.slug, embeddings))
                    .then(async ({ ids }) => {
                        const newDocument = await Document.create({
                            name: metadata?.title ?? 'New Document',
                            workspaceSlug: workspaceReplica.slug,
                            vectorBoxIds: ids,
                        });
                        if (!newDocument) throw new Error('Failed to create document');
                        documentReplicas.push(newDocument);
                    });
            }

            setStatus('synced');
        } catch (error) {
            showToast(`Failed to sync workspace ${workspace.name}`);
            setStatus('error');
        }
    };

    // Reset status after 5 seconds if there is an error so they can try again
    useEffect(() => {
        if (status === 'error') setTimeout(() => { setStatus('idle') }, 5000);
    }, [status]);

    return (
        <View className="flex flex-row justify-between w-full">
            <View className="flex flex-col items-start gap-2">
                <Text className="text-white text-lg font-medium">{workspace.name}</Text>
                <Text className="text-white text-sm">{formatNumber(workspace.threadCount)} threads / {formatNumber(workspace.chatCount)} chats</Text>
                <Text className="text-white text-sm">{formatNumber(workspace.documentCount)} documents</Text>
            </View>
            <TouchableOpacity
                onPress={handleSync}
                disabled={status !== 'idle'}
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', width: 100, height: 40 }} className="flex flex-row items-center justify-center gap-2 px-4 py-1 rounded-full disabled:opacity-50">
                {status === 'syncing' && (
                    <View className="flex flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#FFF" />
                        <Text className="text-white font-medium">Syncing...</Text>
                    </View>
                )}
                {status === 'synced' && (
                    <View className="flex flex-row items-center gap-2">
                        <CheckCircle size={24} color="#FFF" />
                        <Text className="text-white font-medium">Synced!</Text>
                    </View>
                )}
                {status === 'error' && <Text className="text-red-500 font-medium">Error</Text>}
                {status === 'idle' && <Text className="text-white font-medium">Sync</Text>}
            </TouchableOpacity>
        </View>
    );
}