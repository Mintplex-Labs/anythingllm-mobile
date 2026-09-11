import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import IntentLauncher from '@yz1311/react-native-intent-launcher';
import slugify from 'slugify';
import WorkspaceChat from '@/database/models/WorkspaceChat';
import { type WorkspaceType } from '@/database/models/Workspace';
import { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { defaultModels } from '@/utils/models';
import { buildThreadText } from './text';
import { buildThreadJsonString } from './json';
import { buildThreadPdfBase64 } from './pdf';
import { EXPORT_FORMATS, type ExportFormat, type ThreadExportContext } from './types';

export { EXPORT_FORMATS, type ExportFormat, type ThreadExportContext } from './types';

/** iOS: a folder inside the app's Documents directory, which the Files app exposes as "On My iPhone > AnythingLLM" */
const IOS_EXPORT_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/Exports`;

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
    case 'json':
      return { content: buildThreadJsonString(ctx), encoding: 'utf8' };
    case 'pdf':
      return { content: await buildThreadPdfBase64(ctx), encoding: 'base64' };
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Where exports land on this device.
 * Android: the shared Downloads folder. iOS: Documents/Exports, visible in the Files app.
 */
async function resolveExportDirectory(): Promise<{ path: string; locationLabel: string }> {
  if (Platform.OS === 'android') {
    await ensureAndroidStoragePermission();
    return { path: RNFS.DownloadDirectoryPath, locationLabel: 'Downloads' };
  }
  return { path: IOS_EXPORT_FOLDER_PATH, locationLabel: 'Files > On My iPhone > AnythingLLM > Exports' };
}

/**
 * Android 9 and below still gate the Downloads folder behind WRITE_EXTERNAL_STORAGE.
 * Android 10+ lets an app write its own files there without any permission.
 */
async function ensureAndroidStoragePermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version >= 29) return;
  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE, {
    title: 'Save to Downloads',
    message: 'AnythingLLM needs storage access to save the exported thread to your Downloads folder.',
    buttonPositive: 'Allow',
    buttonNegative: 'Cancel',
  });
  if (status !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Storage permission was not granted');
}

/**
 * Pick a filename that does not clobber anything already in the folder:
 * `name.pdf`, then `name (1).pdf`, `name (2).pdf`, ...
 */
async function uniqueFilename(directory: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.');
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  const extension = dot === -1 ? '' : filename.slice(dot);
  let candidate = filename;
  for (let attempt = 1; await RNFS.exists(`${directory}/${candidate}`); attempt++) {
    candidate = `${stem} (${attempt})${extension}`;
    if (attempt > 500) throw new Error('Could not find a free filename for the export');
  }
  return candidate;
}

/**
 * Build the export and save it to the device so the user has the file whether or
 * not they go on to share it.
 */
export async function saveThreadExport(format: ExportFormat, ctx: ThreadExportContext): Promise<SavedThreadExport> {
  const { content, encoding } = await buildThreadExport(format, ctx);
  const { path: directory, locationLabel } = await resolveExportDirectory();
  if (!(await RNFS.exists(directory))) await RNFS.mkdir(directory);

  const filename = await uniqueFilename(directory, exportFilename(ctx.thread.name, format));
  const path = `${directory}/${filename}`;
  await RNFS.writeFile(path, content, encoding);

  // Tell Android's media scanner about the new file so it shows up in the Downloads app straight away
  if (Platform.OS === 'android') await RNFS.scanFile(path).catch(error => log('scanFile failed (non-fatal)', error));

  log(`Saved ${format} export`, { path, chats: ctx.chats.length });
  return { path, filename, format, locationLabel };
}

/** Label for the button that jumps to the saved file's folder */
export const OPEN_LOCATION_LABEL = Platform.OS === 'android' ? 'Open in Downloads' : 'Open in Files';

/**
 * Jump to where the export was saved.
 * Android: the system Downloads app. iOS: the Files app opened at the Exports folder.
 */
export async function openThreadExportLocation(saved: SavedThreadExport): Promise<void> {
  if (Platform.OS === 'android') {
    // The type insists on category/data but the native module only applies keys that are present,
    // and passing empty strings would add a bogus category / data uri to the intent.
    await IntentLauncher.startActivity({ action: 'android.intent.action.VIEW_DOWNLOADS' } as any);
    return;
  }
  const folder = saved.path.slice(0, saved.path.lastIndexOf('/'));
  await Linking.openURL(`shareddocuments://${folder}`);
}

/**
 * Hand an already saved export to the OS share sheet.
 * @returns true when the share sheet was shown (regardless of what the user did with it)
 */
export async function shareThreadExport(saved: SavedThreadExport): Promise<boolean> {
  const definition = EXPORT_FORMATS[saved.format];
  try {
    await Share.open({
      title: saved.filename,
      url: `file://${saved.path}`,
      type: definition.mimeType,
      filename: saved.filename,
      failOnCancel: false,
    });
    return true;
  } catch (error: any) {
    // react-native-share rejects when the user dismisses the sheet on some platforms even with failOnCancel=false
    if (String(error?.message ?? error).toLowerCase().includes('cancel')) return true;
    throw error;
  }
}
