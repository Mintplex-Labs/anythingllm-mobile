import * as RNFS from "@dr.pogodin/react-native-fs";
import { shareDeviceFile, type SavedDeviceFile } from "@/utils/fs/deviceDownloads";

/**
 * What "Download" on a file card means on iOS: the share sheet, which offers "Save to Files". That
 * already covers sharing, so there is no separate share button.
 * @see saveFile.ts
 */

export const HAS_SHARE_BUTTON = false;

/** @returns null - where the file goes is up to the user in the share sheet */
export async function saveFileToDevice({ path, filename, mimeType }: { path: string; filename: string; mimeType: string }): Promise<SavedDeviceFile | null> {
    // The share sheet names a file after what it is called on disk, and generated files are stored under an id.
    const folder = `${RNFS.TemporaryDirectoryPath}/shared-files`;
    const namedPath = `${folder}/${filename}`;
    await RNFS.mkdir(folder);
    await RNFS.unlink(namedPath).catch(() => null);
    await RNFS.copyFile(path, namedPath);
    await shareDeviceFile({ path: namedPath, filename, mimeType });
    return null;
}
