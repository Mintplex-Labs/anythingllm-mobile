import * as RNFS from '@dr.pogodin/react-native-fs';
import * as Levenshtein from 'fastest-levenshtein';

const PROCESSED_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/processed`;

/**
 * Store a file in the processed folder.
 * @param filename - The name of the file to store.
 * @param content - The content to store in the file.
 */
export async function storeProcessedFileAsText(filename: string, content: string) {
    if (!await RNFS.exists(PROCESSED_FOLDER_PATH)) await RNFS.mkdir(PROCESSED_FOLDER_PATH);
    await RNFS.writeFile(`${PROCESSED_FOLDER_PATH}/${filename}`, content, 'utf8');
}

/**
 * List all files in the processed folder - all files are text/plain type
 * @returns A list of files in the processed folder.
 */
export async function listProcessedFiles() {
    if (!await RNFS.exists(PROCESSED_FOLDER_PATH)) return [];
    return await RNFS.readDir(PROCESSED_FOLDER_PATH);
}

type FsSearchMethod = 'eq' | 'contains' | 'regex' | 'fuzzy';

/**
 * Search for a file in the processed folder.
 * @param filename - The name of the file to search for.
 * @param searchMethod - The method to use to search for the file - fuzzy is the default and will use levenshtein distance to find the closest match (2 or less)
 * @returns The content of the file if found, otherwise null.
 */
export async function searchProcessedFilesFor(filename: string, searchMethod: FsSearchMethod = 'eq'): Promise<string | null> {
    const availableFiles = await listProcessedFiles();
    if (!availableFiles.length) return null;
    let foundFile: RNFS.ReadDirResItemT | null = null;

    if (searchMethod === 'fuzzy') {
        const availableFileNames = availableFiles.map(file => file.name.toLowerCase());
        const closestFile = Levenshtein.closest(filename.toLowerCase(), availableFileNames);
        if (closestFile && Levenshtein.distance(filename.toLowerCase(), closestFile) <= 2) foundFile = availableFiles.find(file => file.name.toLowerCase() === closestFile) ?? null;
    } else {
        for (const file of availableFiles) {
            if (searchMethod === 'eq' && file.name.toLowerCase() === filename.toLowerCase()) foundFile = file;
            if (searchMethod === 'contains' && file.name.toLowerCase().includes(filename.toLowerCase())) foundFile = file;
            if (searchMethod === 'regex' && new RegExp(filename).test(file.name)) foundFile = file;
            if (foundFile) break;
        }
    }

    if (!foundFile) return null;
    return await RNFS.readFile(foundFile.path, 'utf8');
}

/**
 * Delete all files in the processed folder by removing the folder itself
 */
export async function deleteProcessedFiles() {
    if (!await RNFS.exists(PROCESSED_FOLDER_PATH)) return;
    await RNFS.unlink(PROCESSED_FOLDER_PATH);
}

/**
 * Get the number of files in the processed folder
 * @returns The number of files in the processed folder
 */
export async function getProcessedFilesCount() {
    if (!await RNFS.exists(PROCESSED_FOLDER_PATH)) return 0;
    return (await RNFS.readDir(PROCESSED_FOLDER_PATH)).length;
}