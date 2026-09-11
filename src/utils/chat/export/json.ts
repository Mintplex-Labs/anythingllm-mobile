import { type WorkspaceChatType } from '@/database/models/WorkspaceChat';
import { type ThreadExportContext } from './types';

export const THREAD_EXPORT_JSON_VERSION = 1;

type ExportedUserMessage = {
  role: 'user';
  content: string;
  createdAt: string;
  /** Image attachments sent with the prompt (names only, never the bytes) */
  attachments?: string[];
};

type ExportedAssistantMessage = {
  role: 'assistant';
  content: string;
  createdAt: string;
  model: string | null;
  metrics: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Output tokens per second */
    outputTps: number;
    /** Generation time in seconds */
    duration: number;
  } | null;
  thoughts?: string[];
  toolCalls?: { signature: string; result: string }[];
  citations?: WorkspaceChatType['response']['citations'];
};

export type ThreadExportJson = {
  version: number;
  app: string;
  exportedAt: string;
  workspace: { name: string; slug: string; isRemote: boolean };
  thread: { name: string; slug: string; createdAt: string | null };
  model: string | null;
  messageCount: number;
  messages: (ExportedUserMessage | ExportedAssistantMessage)[];
};

function toIso(ms?: number | null): string | null {
  if (!ms || Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function attachmentNames(attachments: any[] | undefined): string[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
  const names = attachments
    .map(attachment => attachment?.name ?? attachment?.filename ?? attachment?.fileName)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  return names.length ? names : undefined;
}

/**
 * Structured export of a thread. Each chat row becomes a user + assistant pair so
 * the file is trivially re-playable as an OpenAI style `messages` array, with
 * metrics and model attached to the assistant turn that produced them.
 */
export function buildThreadJson(ctx: ThreadExportContext): ThreadExportJson {
  const { workspace, thread, chats, modelName, exportedAt } = ctx;
  const messages: ThreadExportJson['messages'] = [];

  for (const chat of chats) {
    const createdAt = toIso(chat.createdAt) ?? new Date(exportedAt).toISOString();
    const response = chat.response ?? ({} as WorkspaceChatType['response']);
    const metrics = response.metrics;

    messages.push({
      role: 'user',
      content: chat.prompt ?? '',
      createdAt,
      attachments: attachmentNames(response.attachments),
    });

    const assistant: ExportedAssistantMessage = {
      role: 'assistant',
      content: response.textResponse ?? '',
      createdAt,
      model: modelName,
      metrics: metrics
        ? {
            promptTokens: metrics.prompt_tokens ?? 0,
            completionTokens: metrics.completion_tokens ?? 0,
            totalTokens: metrics.total_tokens ?? 0,
            outputTps: round(metrics.outputTps ?? 0),
            duration: round(metrics.duration ?? 0, 3),
          }
        : null,
    };
    if (response.thoughts?.length) assistant.thoughts = response.thoughts;
    if (response.toolCalls?.length) assistant.toolCalls = response.toolCalls.map(({ signature, result }) => ({ signature, result }));
    if (response.citations?.length) assistant.citations = response.citations;
    messages.push(assistant);
  }

  return {
    version: THREAD_EXPORT_JSON_VERSION,
    app: 'AnythingLLM Mobile',
    exportedAt: new Date(exportedAt).toISOString(),
    workspace: { name: workspace.name, slug: workspace.slug, isRemote: !!workspace.isRemote },
    thread: { name: thread.name, slug: thread.slug, createdAt: toIso(thread.createdAt) },
    model: modelName,
    messageCount: messages.length,
    messages,
  };
}

export function buildThreadJsonString(ctx: ThreadExportContext): string {
  return JSON.stringify(buildThreadJson(ctx), null, 2);
}
