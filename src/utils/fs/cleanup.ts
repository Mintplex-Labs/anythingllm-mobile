import * as RNFS from '@dr.pogodin/react-native-fs';
import { InteractionManager } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import Document from '@/database/models/Document';
import WorkspaceChat from '@/database/models/WorkspaceChat';
import uiStore from '@/store/UIStore';
import { deleteProcessedFiles, deleteProcessedFilesNotIn, listProcessedFiles } from '@/utils/fs';
import { deleteGeneratedDocuments, deleteGeneratedDocumentsNotIn, GENERATED_DOCUMENTS_FOLDER_PATH } from '@/utils/fs/generatedDocuments';

/**
 * Housekeeping for files the app writes to disk. Everything here is derived state:
 *  - `processed/`            plain-text copies of uploaded documents, referenced by `workspace_documents.name`
 *  - `generated-documents/`  files the assistant created, referenced by `file_download` chat actions
 *  - image picker temp files react-native-image-picker writes a downscaled copy to the cache dir
 *                            (`rn_image_picker_*`) - we only ever read its base64, so the file is waste
 *  - `tmp/uploads/`          Android copy-before-parse workaround; normally removed after parsing
 *
 * The models purge their own files on delete, so this sweep is a safety net for anything that
 * slipped through (crashes mid-delete, installs from before the models cleaned up after themselves).
 *
 * Cost control:
 *  - runs at most once per `SWEEP_INTERVAL_MS` (timestamp kept in storage)
 *  - waits for `InteractionManager` so it never competes with the first screen's animations
 *  - only queries the database when the matching folder actually has files in it
 *  - the chat scan reads a single column and only rows that contain a `file_download` action,
 *    so a large chat history is never hydrated into memory
 */

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const IMAGE_PICKER_TEMP_PATTERN = /^rn_image_picker/i;

function log(message: any, ...args: any[]) {
    console.log('\x1b[33m[FsCleanup]\x1b[0m', message, ...args); // eslint-disable-line no-console
}

async function folderHasFiles(path: string): Promise<boolean> {
    try {
        if (!(await RNFS.exists(path))) return false;
        return (await RNFS.readDir(path)).length > 0;
    } catch {
        return false;
    }
}

/** Delete every processed text file no workspace document references anymore */
export async function purgeOrphanedProcessedFiles(): Promise<number> {
    if ((await listProcessedFiles()).length === 0) return 0;
    const documents = await Document.find();
    const referenced = documents.map((doc: { name: string }) => doc.name).filter(Boolean);
    const removed = await deleteProcessedFilesNotIn(referenced);
    if (removed.length) log(`Removed ${removed.length} orphaned processed file(s)`);
    return removed.length;
}

/**
 * Storage filenames referenced by any chat, read without hydrating the chat models.
 * Only rows whose serialized response mentions a file_download action are fetched.
 */
async function referencedGeneratedDocumentNames(): Promise<string[]> {
    const rows = await database.get(WorkspaceChat.table).query(
        Q.unsafeSqlQuery(`select response from ${WorkspaceChat.table} where _status is not 'deleted' and response like '%file_download%'`)
    ).unsafeFetchRaw() as { response: string }[];
    return WorkspaceChat.storageFilenamesFrom(rows);
}

/** Delete every generated document no chat references anymore */
export async function purgeOrphanedGeneratedDocuments(): Promise<number> {
    if (!(await folderHasFiles(GENERATED_DOCUMENTS_FOLDER_PATH))) return 0;
    const referenced = await referencedGeneratedDocumentNames();
    const removed = await deleteGeneratedDocumentsNotIn(referenced);
    if (removed.length) log(`Removed ${removed.length} orphaned generated document(s)`);
    return removed.length;
}

/** Remove leftovers from react-native-image-picker in the cache and temp folders */
export async function purgeImagePickerTempFiles(): Promise<number> {
    const folders = [...new Set([RNFS.CachesDirectoryPath, RNFS.TemporaryDirectoryPath].filter(Boolean))];
    let removed = 0;
    for (const folder of folders) {
        try {
            if (!(await RNFS.exists(folder))) continue;
            const entries = await RNFS.readDir(folder);
            for (const entry of entries) {
                if (!entry.isFile() || !IMAGE_PICKER_TEMP_PATTERN.test(entry.name)) continue;
                await RNFS.unlink(entry.path).then(() => removed++).catch(() => null);
            }
        } catch (e) {
            log('could not scan folder', folder, e);
        }
    }
    if (removed) log(`Removed ${removed} image picker temp file(s)`);
    return removed;
}

/** Remove the Android copy-before-parse scratch folder if a crash left it behind */
export async function purgeUploadScratchFolder(): Promise<void> {
    const path = `${RNFS.TemporaryDirectoryPath}/uploads`;
    try {
        if (await RNFS.exists(path)) {
            await RNFS.unlink(path);
            log('Removed upload scratch folder');
        }
    } catch (e) {
        log('could not remove upload scratch folder', e);
    }
}

/**
 * Best-effort removal of a temp file a picker handed us. Only touches `file://` paths
 * (content:// URIs on Android belong to another app) and never throws.
 */
export async function removePickerTempFile(uri?: string | null): Promise<void> {
    if (!uri || !uri.startsWith('file://')) return;
    const path = decodeURI(uri.replace('file://', ''));
    try {
        if (await RNFS.exists(path)) await RNFS.unlink(path);
    } catch {
        // ignore - the sweep picks it up later
    }
}

/** Run every sweep now, regardless of when the last one ran */
export async function runFileSweep(): Promise<void> {
    const started = Date.now();
    await Promise.all([
        purgeOrphanedProcessedFiles(),
        purgeOrphanedGeneratedDocuments(),
        purgeImagePickerTempFiles(),
        purgeUploadScratchFolder(),
    ]);
    log(`Sweep finished in ${Date.now() - started}ms`);
}

/**
 * Remove every file the app writes for itself, regardless of what references it.
 * Used by "Reset AnythingLLM" and "Clear temporary files". Leaves the user's
 * exports (Documents/Exports on iOS, shared Downloads on Android) and installed models alone.
 */
export async function deleteAllAppFiles(): Promise<void> {
    await Promise.all([
        deleteProcessedFiles(),
        deleteGeneratedDocuments(),
        purgeImagePickerTempFiles(),
        purgeUploadScratchFolder(),
    ]);
    log('Removed all app-managed files');
}

let sweepPromise: Promise<void> | null = null;
/**
 * Sweep once per app session, and no more than once per day across sessions.
 * Deferred until pending interactions and animations have settled. Safe to call repeatedly.
 */
export function purgeOrphanedFiles({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (sweepPromise) return sweepPromise;
    sweepPromise = (async () => {
        try {
            const lastRun = await uiStore.getFromStorage<number>('fs_cleanup_last_run', 0);
            if (!force && Date.now() - lastRun < SWEEP_INTERVAL_MS) return;
            await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
            await runFileSweep();
            await uiStore.setToStorage('fs_cleanup_last_run', Date.now());
        } catch (e) {
            log('sweep failed', e);
        }
    })();
    return sweepPromise;
}
