import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * Downloads to `${toFile}.part` and only moves the file into place once the transfer is verified
 * complete. Every "is this model installed" check in the app is `RNFS.exists(finalPath)`, so a
 * download that dies midway (eg. Android aborts the socket when the phone locks - "Software caused
 * connection abort") must never leave a partial file at the final path. A truncated GGUF left
 * there shows as installed and can crash llama.cpp natively when it is loaded.
 *
 * Throws on a non-2xx status, a byte count that does not match the server's content length, or any
 * transfer error - the `.part` file is always removed on failure.
 */
export async function downloadFileAtomic(
  options: RNFS.DownloadFileOptionsT,
  /** Receives the RNFS job id as soon as the download starts - pass it to `RNFS.stopDownload` to cancel. */
  onJobId?: (jobId: number) => void,
): Promise<RNFS.DownloadResultT> {
  const { toFile, begin } = options;
  const partPath = `${toFile}.part`;
  let expectedBytes = 0;

  if (await RNFS.exists(partPath)) await RNFS.unlink(partPath).catch(() => { });
  try {
    const { jobId, promise } = RNFS.downloadFile({
      ...options,
      toFile: partPath,
      begin: (res) => {
        expectedBytes = res.contentLength;
        begin?.(res);
      },
    });
    onJobId?.(jobId);
    const result = await promise;
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`Download failed with status ${result.statusCode}`);

    const { size } = await RNFS.stat(partPath);
    if (expectedBytes > 0 && size !== expectedBytes) throw new Error(`Download incomplete: received ${size} of ${expectedBytes} bytes`);

    if (await RNFS.exists(toFile)) await RNFS.unlink(toFile);
    await RNFS.moveFile(partPath, toFile);
    return result;
  } catch (error) {
    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath).catch(() => { });
    throw error;
  }
}
