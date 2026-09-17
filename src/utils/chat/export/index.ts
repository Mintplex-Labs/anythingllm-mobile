import slugify from 'slugify';
import WorkspaceChat from '@/database/models/WorkspaceChat';
import { type WorkspaceType } from '@/database/models/Workspace';
import { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { defaultModels } from '@/utils/models';
import { buildThreadText } from './text';
import { buildThreadMarkdown } from './markdown';
import { buildThreadJsonString } from './json';
import { buildThreadPdfBase64 } from './pdf';
import { EXPORT_FORMATS, type ExportFormat, type ThreadExportContext } from './types';
import { openDeviceDownloadsLocation, shareDeviceFile, writeToDeviceDownloads } from '@/utils/fs/deviceDownloads';

export { EXPORT_FORMATS, type ExportFormat, type ThreadExportContext } from './types';
export { OPEN_LOCATION_LABEL } from '@/utils/fs/deviceDownloads';

export type SavedThreadExport = {
  /** Absolute path of the file on disk */
  path: string;
  /** Final file name - may carry a numeric suffix if the name was already taken */
  filename: string;
  format: ExportFormat;
  /** Human readable place the user can find the file */
  locationLabel: string;
};

function log(message: any, ...args: any[]) {
  console.log('\x1b[36m[ThreadExport]\x1b[0m', message, ...args); // eslint-disable-line no-console
}

/**
 * `thread-name.ext` - slugified so it is safe on every filesystem and share target.
 */
export function exportFilename(threadName: string, format: ExportFormat): string {
  const base = slugify(threadName ?? '', { lower: true, strict: true, trim: true }).slice(0, 80) || 'thread';
  return `${base}.${EXPORT_FORMATS[format].extension}`;
}

/**
 * Work out a human readable model name for a thread.
 * Remote threads ask the connected instance, local threads read the LLM preference.
 */
export async function resolveThreadModelName(
  workspace: WorkspaceType,
  llmPreferences: { provider: string; config: any },
): Promise<string | null> {
  if (workspace?.isRemote) {
    try {
      const tag = await workspace.remoteModelTag();
      return tag || null;
    } catch {
      return null;
    }
  }

  const model = llmPreferences?.config?.model;
  if (!model || llmPreferences.provider === 'unknown') return null;
  if (llmPreferences.provider !== 'native') return String(model);
  const definition = defaultModels.find(candidate => candidate.id === model);
  return definition?.name || String(model);
}

/**
 * Gather everything needed to export a thread. Chats are read straight from the
 * local database (remote threads mirror their history there too) so the export
 * does not depend on the chat UI being mounted.
 */
export async function buildThreadExportContext({
  workspace,
  thread,
  modelName,
}: {
  workspace: WorkspaceType;
  thread: WorkspaceThreadType;
  modelName: string | null;
}): Promise<ThreadExportContext> {
  const chats = await WorkspaceChat.find(
    [{ field: 'workspace_thread_slug', value: thread.slug }],
    [{ field: 'created_at', direction: 'asc' }],
  );
  return { workspace, thread, chats, modelName, exportedAt: Date.now() };
}

/** Build the file body for a format. PDFs come back base64 encoded, everything else utf8 */
export async function buildThreadExport(
  format: ExportFormat,
  ctx: ThreadExportContext,
): Promise<{ content: string; encoding: 'utf8' | 'base64' }> {
  switch (format) {
    case 'txt':
      return { content: buildThreadText(ctx), encoding: 'utf8' };
    case 'md':
      return { content: buildThreadMarkdown(ctx), encoding: 'utf8' };
    case 'json':
      return { content: buildThreadJsonString(ctx), encoding: 'utf8' };
    case 'pdf':
      return { content: await buildThreadPdfBase64(ctx), encoding: 'base64' };
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Build the export and save it to the device so the user has the file whether or
 * not they go on to share it.
 */
export async function saveThreadExport(format: ExportFormat, ctx: ThreadExportContext): Promise<SavedThreadExport> {
  const { content, encoding } = await buildThreadExport(format, ctx);
  const saved = await writeToDeviceDownloads({ filename: exportFilename(ctx.thread.name, format), content, encoding });
  log(`Saved ${format} export`, { path: saved.path, chats: ctx.chats.length });
  return { ...saved, format };
}

/**
 * Jump to where the export was saved.
 * Android: the system Downloads app. iOS: the Files app opened at the Exports folder.
 */
export async function openThreadExportLocation(saved: SavedThreadExport): Promise<void> {
  await openDeviceDownloadsLocation(saved.path);
}

/**
 * Hand an already saved export to the OS share sheet.
 * @returns true when the share sheet was shown (regardless of what the user did with it)
 */
export async function shareThreadExport(saved: SavedThreadExport): Promise<boolean> {
  return shareDeviceFile({ path: saved.path, filename: saved.filename, mimeType: EXPORT_FORMATS[saved.format].mimeType });
}
