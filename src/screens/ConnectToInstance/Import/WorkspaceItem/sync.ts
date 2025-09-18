import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { generateUUID } from "@/utils/constants";
import { safeJsonParse } from "@/utils/formatters";
import { parseThinkingParts } from "@/utils/chat";
import { showToast } from "@/utils/Notification";
import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import WorkspaceChat, { WorkspaceChatType } from "@/database/models/WorkspaceChat";
import Telemetry from "@/utils/Telemetry";

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

        const { threads, chats } = await module.sendCommand('workspace-content', { workspaceSlug: workspace.slug });

        // Create workspace replica
        const workspaceReplica = await Workspace.directCreate({
            name: workspace.name,
            slug: generateUUID(), // generate a new uuid for the workspace in case it already exists (imported previously)
            systemPrompt: workspace.openAiPrompt,
            temperature: workspace.openAiTemp,
            isRemote: true,
            remoteConfig: {
                connectionUrl: module.connectionUrl,
                deviceToken: module.deviceToken,
                slug: workspace.slug,
                platform: workspace.platform,
            },
        });

        // Dont make real threads for remote workspaces - we will pull them in real time.
        // make all threads - if default thread, generate a new uuid
        // since that is just a placeholder value so we can bridge desktop and mobile
        const threadPromises = [] as Promise<WorkspaceThread>[];
        for (const thread of threads) {
            const originalSlug = thread.slug;
            if (originalSlug === 'default-thread') thread.slug = generateUUID();
            threadPromises.push(
                WorkspaceThread.directCreate({
                    name: thread.name,
                    slug: thread.slug,
                    workspaceSlug: workspaceReplica.slug,
                    isRemote: true,
                    remoteConfig: {
                        wsSlug: workspace.slug,
                        slug: originalSlug === 'default-thread' ? null : originalSlug,
                        connectionUrl: module.connectionUrl,
                        deviceToken: module.deviceToken,
                        platform: workspace.platform,
                    },
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
        Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.EXTERNAL_WORKSPACE_IMPORTED);
        setStatus('synced');
    } catch (error) {
        console.error(error);
        showToast(`Failed to sync workspace ${workspace.name}`);
        setStatus('error');
    }
};