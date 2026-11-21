import { Linking } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import i18n from '@/i18n';

/**
 * Where user-facing files land on iOS: Documents/Exports, which the Files app shows as
 * "On My iPhone > AnythingLLM".
 * @see deviceLocation.ts
 */

const EXPORT_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/Exports`;

export async function resolveDownloadsDirectory(): Promise<{ path: string; locationLabel: string }> {
  return { path: EXPORT_FOLDER_PATH, locationLabel: i18n.t('files.location.ios_exports') };
}

/** The Files app picks new files up on its own */
export async function announceNewFile(_path: string) {}

/** Label for the button that jumps to where a file was saved - translated when called */
export function openLocationLabel(): string {
  return i18n.t('files.location.open_files');
}

/** Jump to where a file was saved: the Files app opened at the file's folder */
export async function openDeviceDownloadsLocation(path: string): Promise<void> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  await Linking.openURL(`shareddocuments://${folder}`);
}
