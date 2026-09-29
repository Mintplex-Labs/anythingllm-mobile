import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { generateUUID } from "@/utils/constants";
import { safeJsonParse } from "@/utils/formatters";
import { parseThinkingParts } from "@/utils/chat";
import { showToast } from "@/utils/Notification";
import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import WorkspaceChat, { WorkspaceChatType } from "@/database/models/WorkspaceChat";
import Telemetry from "@/utils/Telemetry";
import i18n from "@/i18n";

/** Placeholder slug `workspace-content` uses for chats that are not in any thread */
const REMOTE_DEFAULT_THREAD_SLUG = 'default-thread';

async function getPreviouslyImportedWorkspace(workspaceSlug: string): Promise<WorkspaceType | null> {
    const importedWorkspaces = await Workspace.find([{ field: 'is_remote', value: true }]);
    return importedWorkspaces.find((w) => w.remoteConfig.slug === workspaceSlug) ?? null;
}

export async function syncFromRemote({
    module,
    workspace,
    setStatus,
}: {
    module: AnythingLLMExternal;
    workspace: CommandResponses['workspaces']['workspaces'][number];
    setStatus: (status: 'syncing' | 'synced' | 'error') => void;
}) {
    try {
        setStatus('syncing');

        const previouslyImportedWorkspace = await getPreviouslyImportedWorkspace(workspace.slug);
        if (previouslyImportedWorkspace) {
            console.log('Reimporting workspace that was previously imported - deleting old workspace', previouslyImportedWorkspace.slug);
            await Workspace.delete([{ field: 'slug', value: previouslyImportedWorkspace.slug }]);
        }

        const content = await module.sendCommand('workspace-content', { workspaceSlug: workspace.slug });
        // The remote "default thread" (chats with no thread) is not imported - every imported thread
        // maps to a real remote thread, so remote commands always carry a thread slug.
        const threads = content.threads.filter((thread) => thread.slug !== REMOTE_DEFAULT_THREAD_SLUG);
        const chats = content.chats.filter((chat) => threads.some((t) => t.id === chat.thread_id));

        // Create workspace replica
        const workspaceReplica = await Workspace.directCreate({
            name: workspace.name,
            slug: generateUUID(), // generate a new uuid for the workspace in case it already exists (imported previously)
            systemPrompt: workspace.openAiPrompt,
            temperature: workspace.openAiTemp ?? null, // null = inherit the provider default
            isRemote: true,
            remoteConfig: {
                connectionUrl: module.connectionUrl,
                deviceToken: module.deviceToken,
                slug: workspace.slug,
                platform: workspace.platform,
            },
        });

        const threadPromises = [] as Promise<WorkspaceThread>[];
        for (const thread of threads) {
            threadPromises.push(
                WorkspaceThread.directCreate({
                    name: thread.name,
                    slug: thread.slug,
                    workspaceSlug: workspaceReplica.slug,
                    isRemote: true,
                    remoteConfig: {
                        wsSlug: workspace.slug,
                        slug: thread.slug,
                        connectionUrl: module.connectionUrl,
                        deviceToken: module.deviceToken,
                        platform: workspace.platform,
                    },
                }));
        }
        await Promise.all(threadPromises);
        // Every workspace needs a thread to open - make a fresh one on the remote if it had none.
        if (threads.length === 0) {
            await WorkspaceThread.create({ workspaceSlug: workspaceReplica.slug }).catch(async (error) => {
                await Workspace.delete([{ field: 'slug', value: workspaceReplica.slug }]);
                throw error;
            });
        }

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
                        // Desktop reports seconds - mobile stores milliseconds.
                        duration: (fkChat.metrics?.duration ?? 0) * 1000,
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
        Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.EXTERNAL_WORKSPACE_IMPORTED);
        setStatus('synced');
    } catch (error) {
        console.error(error);
        showToast(i18n.t('connect.import.sync_workspace_failed', { name: workspace.name }));
        setStatus('error');
    }
};