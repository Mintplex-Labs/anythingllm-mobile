import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import IntentLauncher from '@yz1311/react-native-intent-launcher';

/**
 * Putting a file somewhere the user can find it outside the app.
 *
 * Android: the shared Downloads folder (what users expect "download" to mean).
 * iOS: a folder inside the app's Documents directory, which the Files app exposes as
 * "On My iPhone > AnythingLLM". Shared by the thread exporter and the generated-file
 * download cards so both land in the same place with the same permission handling.
 */

/** iOS: Documents/Exports, visible in the Files app */
export const IOS_EXPORT_FOLDER_PATH = `${RNFS.DocumentDirectoryPath}/Exports`;

export type SavedDeviceFile = {
  /** Absolute path of the file on disk */
  path: string;
  /** Final file name - may carry a numeric suffix if the name was already taken */
  filename: string;
  /** Human readable place the user can find the file */
  locationLabel: string;
};

function log(message: any, ...args: any[]) {
  console.log('\x1b[36m[DeviceDownloads]\x1b[0m', message, ...args); // eslint-disable-line no-console
}

/**
 * Where user-facing files land on this device.
 * Android: the shared Downloads folder. iOS: Documents/Exports, visible in the Files app.
 */
export async function resolveDownloadsDirectory(): Promise<{ path: string; locationLabel: string }> {
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
export async function ensureAndroidStoragePermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version >= 29) return;
  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE, {
    title: 'Save to Downloads',
    message: 'AnythingLLM needs storage access to save the file to your Downloads folder.',
    buttonPositive: 'Allow',
    buttonNegative: 'Cancel',
  });
  if (status !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Storage permission was not granted');
}

/**
 * Pick a filename that does not clobber anything already in the folder:
 * `name.pdf`, then `name (1).pdf`, `name (2).pdf`, ...
 */
export async function uniqueFilename(directory: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.');
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  const extension = dot === -1 ? '' : filename.slice(dot);
  let candidate = filename;
  for (let attempt = 1; await RNFS.exists(`${directory}/${candidate}`); attempt++) {
    candidate = `${stem} (${attempt})${extension}`;
    if (attempt > 500) throw new Error('Could not find a free filename');
  }
  return candidate;
}

async function prepareDestination(filename: string): Promise<{ path: string; filename: string; locationLabel: string }> {
  const { path: directory, locationLabel } = await resolveDownloadsDirectory();
  if (!(await RNFS.exists(directory))) await RNFS.mkdir(directory);
  const finalName = await uniqueFilename(directory, filename);
  return { path: `${directory}/${finalName}`, filename: finalName, locationLabel };
}

/** Tell Android's media scanner about a new file so it shows up in the Downloads app straight away */
async function announceToMediaScanner(path: string) {
  if (Platform.OS !== 'android') return;
  await RNFS.scanFile(path).catch(error => log('scanFile failed (non-fatal)', error));
}

/** Write content straight into the device's downloads location */
export async function writeToDeviceDownloads({
  filename,
  content,
  encoding,
}: {
  filename: string;
  content: string;
  encoding: 'utf8' | 'base64';
}): Promise<SavedDeviceFile> {
  const destination = await prepareDestination(filename);
  await RNFS.writeFile(destination.path, content, encoding);
  await announceToMediaScanner(destination.path);
  log(`Wrote ${destination.filename} to ${destination.locationLabel}`);
  return destination;
}

/** Copy an existing file (eg: a generated document) into the device's downloads location */
export async function copyToDeviceDownloads({ filename, sourcePath }: { filename: string; sourcePath: string }): Promise<SavedDeviceFile> {
  const destination = await prepareDestination(filename);
  await RNFS.copyFile(sourcePath, destination.path);
  await announceToMediaScanner(destination.path);
  log(`Copied ${destination.filename} to ${destination.locationLabel}`);
  return destination;
}

/** Label for the button that jumps to the saved file's folder */
export const OPEN_LOCATION_LABEL = Platform.OS === 'android' ? 'Open in Downloads' : 'Open in Files';

/**
 * Jump to where a file was saved.
 * Android: the system Downloads app. iOS: the Files app opened at the file's folder.
 */
export async function openDeviceDownloadsLocation(path: string): Promise<void> {
  if (Platform.OS === 'android') {
    // The type insists on category/data but the native module only applies keys that are present,
    // and passing empty strings would add a bogus category / data uri to the intent.
    await IntentLauncher.startActivity({ action: 'android.intent.action.VIEW_DOWNLOADS' } as any);
    return;
  }
  const folder = path.slice(0, path.lastIndexOf('/'));
  await Linking.openURL(`shareddocuments://${folder}`);
}

/**
 * Hand a file on disk to the OS share sheet.
 * @returns true when the share sheet was shown (regardless of what the user did with it)
 */
export async function shareDeviceFile({ path, filename, mimeType }: { path: string; filename: string; mimeType: string }): Promise<boolean> {
  try {
    await Share.open({
      title: filename,
      url: `file://${path}`,
      type: mimeType,
      filename,
      failOnCancel: false,
    });
    return true;
  } catch (error: any) {
    // react-native-share rejects when the user dismisses the sheet on some platforms even with failOnCancel=false
    if (String(error?.message ?? error).toLowerCase().includes('cancel')) return true;
    throw error;
  }
}
