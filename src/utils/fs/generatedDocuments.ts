import * as RNFS from '@dr.pogodin/react-native-fs';
import { generateUUID } from '@/utils/constants';

/**
 * Storage for files the assistant generates with the create-files tools (text, PDF, Word,
 * PowerPoint). Mirrors the desktop `storage/generated-files` folder managed by
 * `server/utils/agents/aibitat/plugins/create-files/lib.js`.
 *
 * Files are written under a `{fileType}-{uuid}.{ext}` storage name so nothing the model
 * picks as a filename can escape the folder or clobber another file. The user-facing name
 * is kept on the chat action (`IFileDownloadAction`) and used when the file is saved to the
 * device or shared.
 *
 * "Clear temporary files" in the user settings removes the whole folder - the download card
 * in the chat history checks `generatedDocumentExists` so it can show a "no longer available"
 * state instead of a broken button.
 */
export const GENERATED_DOCUMENTS_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/generated-documents`;

const STORAGE_FILENAME_PATTERN = /^[a-z0-9]+-[a-f0-9-]{36}\.[a-z0-9]+$/i;

export type GeneratedDocument = {
    /** Name of the file inside the generated-documents folder */
    storageFilename: string;
    /** User-facing filename */
    displayFilename: string;
    /** Absolute path on disk */
    path: string;
    /** Size in bytes */
    fileSize: number;
};

function log(text: string, ...args: any[]) {
    console.log(`\x1b[35m[GeneratedDocuments] ${text}\x1b[0m`, ...args); // eslint-disable-line no-console
}

/** Whether a name looks like one `saveGeneratedDocument` produced - guards against path traversal */
export function isValidStorageFilename(storageFilename: string): boolean {
    return typeof storageFilename === 'string' && STORAGE_FILENAME_PATTERN.test(storageFilename);
}

/** Absolute path of a generated document, or null when the storage name is not one of ours */
export function generatedDocumentPath(storageFilename: string): string | null {
    if (!isValidStorageFilename(storageFilename)) return null;
    return `${GENERATED_DOCUMENTS_FOLDER_PATH}/${storageFilename}`;
}

/**
 * Write a generated file to the generated-documents folder.
 * @param fileType - short type tag used in the storage name eg: 'docx', 'pptx', 'text'
 * @param extension - file extension without the dot
 * @param displayFilename - the user-facing filename (already sanitized by the caller)
 * @param content - file body; base64 for binary formats, utf8 for text
 */
export async function saveGeneratedDocument({
    fileType,
    extension,
    displayFilename,
    content,
    encoding,
}: {
    fileType: string;
    extension: string;
    displayFilename: string;
    content: string;
    encoding: 'utf8' | 'base64';
}): Promise<GeneratedDocument> {
    if (!(await RNFS.exists(GENERATED_DOCUMENTS_FOLDER_PATH))) await RNFS.mkdir(GENERATED_DOCUMENTS_FOLDER_PATH);
    const safeType = fileType.toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
    const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const storageFilename = `${safeType}-${generateUUID()}.${safeExtension}`;
    const path = `${GENERATED_DOCUMENTS_FOLDER_PATH}/${storageFilename}`;

    await RNFS.writeFile(path, content, encoding);
    const stat = await RNFS.stat(path);
    const fileSize = Number(stat.size) || 0;
    log(`Saved ${storageFilename} (${fileSize} bytes) as "${displayFilename}"`);
    return { storageFilename, displayFilename, path, fileSize };
}

/** Whether a generated document is still on disk */
export async function generatedDocumentExists(storageFilename: string): Promise<boolean> {
    const path = generatedDocumentPath(storageFilename);
    if (!path) return false;
    try {
        return await RNFS.exists(path);
    } catch {
        return false;
    }
}

/**
 * Delete specific generated documents by their storage filename.
 * Called when the chats that reference them are deleted so nothing lingers on disk.
 */
export async function deleteGeneratedDocumentsByStorageFilenames(storageFilenames: string[]): Promise<void> {
    if (!storageFilenames.length) return;
    if (!(await RNFS.exists(GENERATED_DOCUMENTS_FOLDER_PATH))) return;
    let removed = 0;
    for (const storageFilename of new Set(storageFilenames)) {
        const path = generatedDocumentPath(storageFilename);
        if (!path) continue;
        try {
            if (await RNFS.exists(path)) {
                await RNFS.unlink(path);
                removed++;
            }
        } catch (e) {
            console.error('[GeneratedDocuments] could not remove', storageFilename, e);
        }
    }
    if (removed) log(`Deleted ${removed} generated document(s) referenced by removed chats`);
}

/**
 * Delete every generated document that is not in `referencedStorageFilenames`.
 * @returns the storage filenames that were removed
 */
export async function deleteGeneratedDocumentsNotIn(referencedStorageFilenames: string[]): Promise<string[]> {
    if (!(await RNFS.exists(GENERATED_DOCUMENTS_FOLDER_PATH))) return [];
    const referenced = new Set(referencedStorageFilenames);
    const files = await RNFS.readDir(GENERATED_DOCUMENTS_FOLDER_PATH);
    const removed: string[] = [];
    for (const file of files) {
        if (referenced.has(file.name)) continue;
        try {
            await RNFS.unlink(file.path);
            removed.push(file.name);
        } catch (e) {
            console.error('[GeneratedDocuments] could not remove orphan', file.name, e);
        }
    }
    return removed;
}

/** Delete every generated document by removing the folder itself */
export async function deleteGeneratedDocuments(): Promise<void> {
    if (!(await RNFS.exists(GENERATED_DOCUMENTS_FOLDER_PATH))) return;
    await RNFS.unlink(GENERATED_DOCUMENTS_FOLDER_PATH);
    log('Deleted all generated documents');
}

/** Number of generated documents currently on disk */
export async function getGeneratedDocumentsCount(): Promise<number> {
    if (!(await RNFS.exists(GENERATED_DOCUMENTS_FOLDER_PATH))) return 0;
    return (await RNFS.readDir(GENERATED_DOCUMENTS_FOLDER_PATH)).length;
}
