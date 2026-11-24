import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { generateUUID } from "@/utils/constants";
import { safeJsonParse } from "@/utils/formatters";
import { parseThinkingParts } from "@/utils/chat";
import { showToast } from "@/utils/Notification";
import * as RNFS from "@dr.pogodin/react-native-fs";
import AnythingLLMExternal, { CommandResponses, ResponseTooLargeError, WORKSPACE_SYNC_ATTACHMENTS_FOLDER } from "@/utils/AnythingLLMExternal";
import { prepareSharedImage } from "@/utils/SharedContent";
import { IMAGE_MAX_DIMENSION, IMAGE_QUALITY } from "@/hooks/useAttachments";
import WorkspaceChat, { WorkspaceChatType } from "@/database/models/WorkspaceChat";
import Telemetry from "@/utils/Telemetry";
import i18n from "@/i18n";

/** Placeholder slug `workspace-content` uses for chats that are not in any thread */
const REMOTE_DEFAULT_THREAD_SLUG = 'default-thread';

async function getPreviouslyImportedWorkspace(workspaceSlug: string): Promise<WorkspaceType | null> {
    const importedWorkspaces = await Workspace.find([{ field: 'is_remote', value: true }]);
    return importedWorkspaces.find((w) => w.remoteConfig.slug === workspaceSlug) ?? null;
}

/** Bytes of the workspace downloaded so far; `total` is null when the size is not known up front */
export type SyncProgress = { received: number, total: number | null };

type ImportedImage = { name: string, mime: string, contentString: string };

/**
 * Turns a synced chat's attachments into the inline images local chats keep. `sendCommand` spooled each image
 * to a file; it is scaled down the way a photo attached to a hosted model is and embedded as a JPEG data URL,
 * so a long thread of photos does not load hundreds of MB when it is opened. Each file is deleted once read.
 */
async function importImageAttachments(attachments: unknown): Promise<ImportedImage[]> {
    if (!Array.isArray(attachments)) return [];
    const images: ImportedImage[] = [];
    for (const attachment of attachments) {
        const uri = attachment?.contentString;
        if (typeof uri !== 'string' || !uri.startsWith('file://')) continue;
        try {
            const { base64, mime } = await prepareSharedImage(uri, { maxDimension: IMAGE_MAX_DIMENSION.external, quality: IMAGE_QUALITY });
            images.push({ name: attachment.name || 'image.jpg', mime, contentString: `data:${mime};base64,${base64}` });
        } catch (error) {
            console.error(`Could not import image attachment ${attachment?.name}`, error);
        } finally {
            await RNFS.unlink(uri.slice('file://'.length)).catch(() => null);
        }
    }
    return images;
}

export async function syncFromRemote({
    module,
    workspace,
    setStatus,
    setProgress,
}: {
    module: AnythingLLMExternal;
    workspace: CommandResponses['workspaces']['workspaces'][number];
    setStatus: (status: 'syncing' | 'synced' | 'error') => void;
    setProgress: (progress: SyncProgress | null) => void;
}) {
    // Image attachments are written here while the workspace downloads (see `sendCommand`)
    const attachmentsDir = `${WORKSPACE_SYNC_ATTACHMENTS_FOLDER}/${generateUUID()}`;
    try {
        setStatus('syncing');

        await RNFS.mkdir(attachmentsDir);
        const content = await module.sendCommand('workspace-content', { workspaceSlug: workspace.slug }, {
            attachmentsDir,
            onProgress: (received, total) => setProgress({ received, total }),
        });
        setProgress(null);

        // Only replace the earlier copy once the new one has downloaded, so a failed sync keeps it
        const previouslyImportedWorkspace = await getPreviouslyImportedWorkspace(workspace.slug);
        if (previouslyImportedWorkspace) {
            console.log('Reimporting workspace that was previously imported - deleting old workspace', previouslyImportedWorkspace.slug);
            await Workspace.delete([{ field: 'slug', value: previouslyImportedWorkspace.slug }]);
        }

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
            // One image at a time, so only one full size photo is decoded at once
            const attachments = await importImageAttachments(fkChat.attachments);
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
                    attachments,
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
        const message = error instanceof ResponseTooLargeError ? 'connect.import.sync_workspace_too_large' : 'connect.import.sync_workspace_failed';
        showToast(i18n.t(message, { name: workspace.name }));
        setStatus('error');
    } finally {
        setProgress(null);
        await RNFS.unlink(attachmentsDir).catch(() => null);
    }
};