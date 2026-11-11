import { shareDeviceFile, type SavedDeviceFile } from "@/utils/fs/deviceDownloads";

/**
 * What "Download" on a file card means on iOS: the share sheet, which offers "Save to Files". That
 * already covers sharing, so there is no separate share button.
 * @see saveFile.ts
 */

export const HAS_SHARE_BUTTON = false;

/** @returns null - where the file goes is up to the user in the share sheet */
export async function saveFileToDevice({ path, filename, mimeType }: { path: string; filename: string; mimeType: string }): Promise<SavedDeviceFile | null> {
    await shareDeviceFile({ path, filename, mimeType });
    return null;
}
