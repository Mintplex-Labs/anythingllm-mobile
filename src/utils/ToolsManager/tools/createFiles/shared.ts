import { type IFileDownloadAction } from "@/database/models/WorkspaceChat";
import { type IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import uiStore from "@/store/UIStore";
import { type GeneratedDocument } from "@/utils/fs/generatedDocuments";
import { formatKilobytes } from "@/utils/documents/shared";

/**
 * Bits shared by the create-files tools - the mobile counterpart of
 * `server/utils/agents/aibitat/plugins/create-files/lib.js`.
 */

export type StreamEmitter = (event: IStreamEvent, data: any) => void;

/** Tool arguments arrive as a JSON string from most providers and as an object from a few */
export function parseToolArgs<T extends Record<string, any>>(args: unknown, fallback: T): T {
    if (args && typeof args === 'object') return { ...fallback, ...(args as T) };
    const parsed = safeJsonParse(String(args ?? ''), null);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return { ...fallback, ...(parsed as T) };
}

/**
 * Push a download card into the current turn. Persisted with the chat as an action so the
 * card survives reloads (`ActionsContainer` / `FileDownloadCard` render it).
 */
export function reportGeneratedFile(streamEmitter: StreamEmitter, saved: GeneratedDocument, mimeType: string) {
    const action: IFileDownloadAction = {
        type: 'file_download',
        action: {
            title: saved.displayFilename,
            storageFilename: saved.storageFilename,
            fileSize: saved.fileSize,
            mimeType,
        },
    };
    streamEmitter('report_action', action);
}

/** The model-facing success message all create-files tools share */
export function generatedFileResult(kind: string, saved: GeneratedDocument, extra = ''): string {
    return `Successfully created ${kind} "${saved.displayFilename}" (${formatKilobytes(saved.fileSize)})${extra}. The user can download it from the card shown in the chat.`;
}

/** The provider the user chats with - used by tools that need their own LLM calls */
export async function getConfiguredLLMProvider() {
    const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} });
    if (preferences.provider === 'unknown') throw new Error('LLM provider is unknown');
    // Lazy load to avoid the circular dependency AiProviders -> ToolsManager -> tools
    // @ts-ignore
    const { default: getLLM } = await import("@/utils/AiProviders");
    return getLLM(preferences.provider, preferences.config);
}
