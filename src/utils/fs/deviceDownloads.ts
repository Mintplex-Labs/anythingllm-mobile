import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import { announceNewFile, resolveDownloadsDirectory } from './deviceLocation';

/**
 * Putting a file somewhere the user can find it outside the app.
 *
 * Android: the shared Downloads folder (what users expect "download" to mean).
 * iOS: a folder inside the app's Documents directory, which the Files app exposes as
 * "On My iPhone > AnythingLLM". Shared by the thread exporter and the generated-file
 * download cards so both land in the same place with the same permission handling.
 */

export type SavedDeviceFile = {
  /** Absolute path of the file on disk */
  path: string;
  /** Final file name - may carry a numeric suffix if the name was already taken */
  filename: string;
  /** Human readable place the user can find the file */
  locationLabel: string;
};

function log(message: any, ...args: any[]) {
  console.log('\x1b[36m[DeviceDownloads]\x1b[0m', message, ...args);
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
  await announceNewFile(destination.path);
  log(`Wrote ${destination.filename} to ${destination.locationLabel}`);
  return destination;
}

/** Copy an existing file (eg: a generated document) into the device's downloads location */
export async function copyToDeviceDownloads({ filename, sourcePath }: { filename: string; sourcePath: string }): Promise<SavedDeviceFile> {
  const destination = await prepareDestination(filename);
  await RNFS.copyFile(sourcePath, destination.path);
  await announceNewFile(destination.path);
  log(`Copied ${destination.filename} to ${destination.locationLabel}`);
  return destination;
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
