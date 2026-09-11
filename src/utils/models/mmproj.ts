import * as RNFS from '@dr.pogodin/react-native-fs';
import uiStore from '@/store/UIStore';
import { type Model } from '@/utils/types';
import { defaultModels } from '@/utils/models';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';

export const MMPROJ_DOWNLOAD_EVENT = 'MMPROJ_DOWNLOAD_CHANGED' as const;

export type MmprojDownloadStatus = 'idle' | 'downloading' | 'complete' | 'cancelled' | 'failed';
export type MmprojDownloadState = {
  modelId: string;
  status: MmprojDownloadStatus;
  /** 0-100 */
  progress: number;
  error?: string;
};

/** Progress ticks from RNFS - the UI bar animates every tick so keep this short. */
const PROGRESS_INTERVAL_MS = 250;

/**
 * Downloads the vision projector (mmproj) for a catalog model on demand - the projector is no longer
 * fetched with the model, the user opts in from the attachments sheet when they first want images.
 *
 * Module level singleton so a download survives the sheet closing or the user leaving the chat:
 * subscribers listen to `MMPROJ_DOWNLOAD_EVENT` on the global emitter and read `stateFor` on mount.
 *
 * The file is streamed to a `.part` path and only moved into place when complete, so
 * `OnDeviceProvider.modelSupportsVision` (a plain "does the file exist" check) can never see a
 * truncated projector. Cancelling removes the partial file.
 */
class MmprojDownloader {
  private jobs = new Map<string, { jobId: number | null; state: MmprojDownloadState }>();

  static definitionFor(modelId: string | null | undefined): Model | undefined {
    if (!modelId) return undefined;
    return defaultModels.find((model) => model.id === modelId) as Model | undefined;
  }

  static pathFor(model: Model | undefined): string | null {
    if (!model?.mmproj?.downloadUrl) return null;
    return resolveDestinationPathFromGGUFUrl(model.mmproj.downloadUrl);
  }

  /** True when the model declares a projector and it is fully downloaded. */
  static async isDownloaded(model: Model | undefined): Promise<boolean> {
    const path = MmprojDownloader.pathFor(model);
    if (!path) return false;
    return RNFS.exists(path).catch(() => false);
  }

  stateFor(modelId: string): MmprojDownloadState {
    return this.jobs.get(modelId)?.state ?? { modelId, status: 'idle', progress: 0 };
  }

  isDownloading(modelId: string): boolean {
    return this.stateFor(modelId).status === 'downloading';
  }

  private publish(modelId: string, patch: Partial<MmprojDownloadState>) {
    const job = this.jobs.get(modelId);
    const state: MmprojDownloadState = { ...(job?.state ?? { modelId, status: 'idle', progress: 0 }), ...patch, modelId };
    this.jobs.set(modelId, { jobId: job?.jobId ?? null, state });
    uiStore.emitter.emit(MMPROJ_DOWNLOAD_EVENT, state);
  }

  /**
   * Starts (or joins) the projector download for `model`. Resolves true once the projector is in
   * place, false when cancelled or failed - the final state is also broadcast on the emitter.
   */
  async start(model: Model): Promise<boolean> {
    const modelId = model.id;
    const finalPath = MmprojDownloader.pathFor(model);
    if (!finalPath || !model.mmproj) return false;
    if (this.isDownloading(modelId)) return false; // already running - subscribers will hear the result
    if (await RNFS.exists(finalPath)) {
      this.publish(modelId, { status: 'complete', progress: 100 });
      return true;
    }

    const partPath = `${finalPath}.part`;
    const dirPath = finalPath.substring(0, finalPath.lastIndexOf('/'));
    this.publish(modelId, { status: 'downloading', progress: 0, error: undefined });

    try {
      await RNFS.mkdir(dirPath, { NSURLIsExcludedFromBackupKey: true });
      if (await RNFS.exists(partPath)) await RNFS.unlink(partPath).catch(() => { });

      const { jobId, promise } = RNFS.downloadFile({
        fromUrl: model.mmproj.downloadUrl,
        toFile: partPath,
        progressInterval: PROGRESS_INTERVAL_MS,
        background: true,
        discretionary: true,
        progress: (res) => {
          if (!this.isDownloading(modelId)) return; // cancelled - ignore late ticks
          const total = res.contentLength || model.mmproj?.size || 0;
          const progress = total > 0 ? Math.min(99, Math.round((res.bytesWritten / total) * 100)) : 0;
          this.publish(modelId, { progress });
        },
      });
      const job = this.jobs.get(modelId);
      if (job) job.jobId = jobId;

      const result = await promise;
      if (!this.isDownloading(modelId)) throw new Error('cancelled');
      if (result.statusCode && result.statusCode >= 400) throw new Error(`Download failed with status ${result.statusCode}`);

      await RNFS.moveFile(partPath, finalPath);
      this.publish(modelId, { status: 'complete', progress: 100 });

      // If this model is already loaded text-only, reload it on the next prompt so the projector attaches.
      OnDeviceProvider.instance?.requestReload();
      return true;
    } catch (error) {
      const cancelled = this.stateFor(modelId).status === 'cancelled' || (error as Error)?.message === 'cancelled';
      if (await RNFS.exists(partPath)) await RNFS.unlink(partPath).catch(() => { });
      if (cancelled) {
        this.publish(modelId, { status: 'cancelled', progress: 0 });
      } else {
        console.error('[MmprojDownloader] download failed', error);
        this.publish(modelId, { status: 'failed', progress: 0, error: (error as Error)?.message || 'Download failed' });
      }
      return false;
    } finally {
      const job = this.jobs.get(modelId);
      if (job) job.jobId = null;
    }
  }

  /** Stops an in-flight download; the partial file is removed by `start`'s cleanup. */
  cancel(modelId: string) {
    const job = this.jobs.get(modelId);
    if (!job || job.state.status !== 'downloading') return;
    this.publish(modelId, { status: 'cancelled', progress: 0 });
    if (job.jobId !== null) {
      try { RNFS.stopDownload(job.jobId); } catch (e) { console.log('[MmprojDownloader] stopDownload failed', e); }
    }
  }
}

const mmprojDownloader = new MmprojDownloader();
export { MmprojDownloader };
export default mmprojDownloader;
