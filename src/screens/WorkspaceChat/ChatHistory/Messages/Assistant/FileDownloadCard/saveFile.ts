import { copyToDeviceDownloads, type SavedDeviceFile } from "@/utils/fs/deviceDownloads";

/**
 * What "Download" on a file card means: the file is copied to the shared Downloads folder. Sharing
 * is a separate button next to it.
 * @see saveFile.ios.ts
 */

export const HAS_SHARE_BUTTON = true;

/** @returns where the file was saved */
export async function saveFileToDevice({ path, filename }: { path: string; filename: string; mimeType: string }): Promise<SavedDeviceFile | null> {
    return copyToDeviceDownloads({ filename, sourcePath: path });
}
