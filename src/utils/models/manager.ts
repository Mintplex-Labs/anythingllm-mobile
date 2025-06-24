import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * The standard gguf folder is in the app's files directory.
 * This is where the models are downloaded to and loaded from.
 */
export const DEFAULT_GGUF_FOLDER = `${RNFS.DocumentDirectoryPath}/models/gguf`;

export default async function uninstallAllModels() {
    const pathsToDelete: string[] = [];
    const foldersToDelete = await RNFS.readDir(DEFAULT_GGUF_FOLDER);
    for (const folder of foldersToDelete) pathsToDelete.push(folder.path);
    await Promise.all(pathsToDelete.map((path) => RNFS.unlink(path)));
    return true;
}