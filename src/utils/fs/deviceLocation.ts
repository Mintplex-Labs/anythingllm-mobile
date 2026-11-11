import { PermissionsAndroid, Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import IntentLauncher from '@yz1311/react-native-intent-launcher';
import i18n from '@/i18n';

/**
 * Where user-facing files land: the shared Downloads folder, what users expect "download" to mean.
 * @see deviceLocation.ios.ts
 */

export async function resolveDownloadsDirectory(): Promise<{ path: string; locationLabel: string }> {
  await ensureStoragePermission();
  return { path: RNFS.DownloadDirectoryPath, locationLabel: i18n.t('files.location.downloads') };
}

/**
 * Android 9 and below still gate the Downloads folder behind WRITE_EXTERNAL_STORAGE.
 * Android 10+ lets an app write its own files there without any permission.
 */
async function ensureStoragePermission(): Promise<void> {
  if ((Platform.Version as number) >= 29) return;
  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE, {
    title: i18n.t('files.storage_permission.title'),
    message: i18n.t('files.storage_permission.message'),
    buttonPositive: i18n.t('common.allow'),
    buttonNegative: i18n.t('common.cancel'),
  });
  if (status !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Storage permission was not granted');
}

/** Tell the media scanner about a new file so it shows up in the Downloads app straight away */
export async function announceNewFile(path: string) {
  await RNFS.scanFile(path).catch(error => console.log('\x1b[36m[DeviceDownloads]\x1b[0m scanFile failed (non-fatal)', error));
}

/** Label for the button that jumps to where a file was saved - translated when called */
export function openLocationLabel(): string {
  return i18n.t('files.location.open_downloads');
}

/** Jump to where a file was saved: the system Downloads app */
export async function openDeviceDownloadsLocation(_path: string): Promise<void> {
  // The type insists on category/data but the native module only applies keys that are present,
  // and passing empty strings would add a bogus category / data uri to the intent.
  await IntentLauncher.startActivity({ action: 'android.intent.action.VIEW_DOWNLOADS' } as any);
}
