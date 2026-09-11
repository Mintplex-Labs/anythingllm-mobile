import { useState, useEffect } from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { useNetInfo } from '@react-native-community/netinfo';
import { formatBytes } from '@/utils/formatters';
import AwaitableAlert from '@/components/AwaitableAlert';
import uiStore from '@/store/UIStore';
import PushNotifications from '@/utils/PushNotifications';
import { activateKeepAwake, deactivateKeepAwake } from '@/utils/keepAwake';
import ImportedModels from '@/utils/models/imported';

const UI_PROGRESS_INTERVAL_MS = 250;
const NOTIFICATION_PROGRESS_INTERVAL_MS = 5000;

interface UseModelManagerProps {
  llmPreferences: any;
  fetchLLMPreference: () => Promise<void>;
  LLMProvider?: any;
}

export default function useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider }: UseModelManagerProps) {
  const netInfo = useNetInfo();
  const [modelDownloadUrl, setModelDownloadUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedModels, setDownloadedModels] = useState<{ [key: string]: boolean }>({});
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Check which models are downloaded and set initial selection
  useEffect(() => {
    async function fetchModels() {
      if (LLMProvider) {
        const models = await LLMProvider.availableModels();
        updateDownloadedModels(models);
        setSelectedModel(LLMProvider.model || null);
      }
    }
    fetchModels();
  }, [LLMProvider]);

  const updateDownloadedModels = async (models: any[]) => {
    const downloaded: { [key: string]: boolean } = {};
    for (const model of models) {
      const path = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
      downloaded[model.modelId] = await RNFS.exists(path);
    }
    setDownloadedModels(downloaded);
  };

  /**
   * Run the pre-download confirmation checks
   * - Will deny download if there is no internet connection
   * - Will ask to continue download if the model is not a Wi-Fi connection
   * - Will final confirmation before download of model
   * @param model - The model to download
   * @returns True if the model can be downloaded, false otherwise
   */
  async function runPreDownloadConfirmations(model: any): Promise<boolean> {
    const modelSize = typeof model.size === 'number' ? formatBytes(model.size) : model.size;
    if (!netInfo.isConnected) {
      await AwaitableAlert(
        'No internet connection.',
        'You will need to be connected to the internet to download any model.',
        { text: 'Dismiss', style: 'default' },
        { text: 'OK', style: 'default' },
      );
      return false;
    }

    if (netInfo.type !== 'wifi') {
      const ignoreWarning = await AwaitableAlert(
        'Data usage warning',
        `We recommend using a Wi-Fi connection to download the model since it's ${modelSize} in size.`,
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue Anyway', style: 'default' },
      );
      if (!ignoreWarning) return false;
    }

    const shouldDownload = await AwaitableAlert(
      'Download model?',
      `This will download the model to your device. It is ${modelSize} in size.`,
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue with download', style: 'default' },
    );
    if (!shouldDownload) return false;
    return true;
  }

  /**
   * Download a model
   * @param model - The model to download
   * @param runPrefetchChecks - If true, the model will be downloaded and the pre-download confirmation checks will be run. Otherwise, it is assumed these checks have already been run prior to calling this function.
   * @returns True if the model was downloaded, false otherwise
   */
  /**
   * Streams one file to disk while driving the in-app progress state and the system notification.
   */
  const downloadToStorage = async ({ fromUrl, toFile, title, body }: { fromUrl: string; toFile: string; title: string; body: string }) => {
    // Create the directory if it doesn't exist
    const dirPath = toFile.substring(0, toFile.lastIndexOf('/'));
    await RNFS.mkdir(dirPath, { NSURLIsExcludedFromBackupKey: true });
    setDownloadProgress(0);

    const downloadNotificationId = await PushNotifications.send('progress', {
      title,
      body,
      android: {
        progress: {
          indeterminate: true,
        },
      },
    });

    try {
      // The in-app card animates every tick, so poll often. The system notification
      // is rate-limited by Android, so only push to it every few seconds.
      let lastNotifiedAt = 0;
      await RNFS.downloadFile({
        fromUrl,
        toFile,
        progress: res => {
          const progress = Math.round((res.bytesWritten / res.contentLength) * 100);
          setDownloadProgress(progress);
          const now = Date.now();
          if (now - lastNotifiedAt < NOTIFICATION_PROGRESS_INTERVAL_MS) return;
          lastNotifiedAt = now;
          PushNotifications.send('progress', {
            id: downloadNotificationId,
            title,
            body,
            android: {
              progress: {
                current: progress,
                max: 100,
              },
            },
          });
        },
        background: true,
        discretionary: true,
        progressInterval: UI_PROGRESS_INTERVAL_MS,
      }).promise;

      // The progress callback only fires every `progressInterval` ms, so the last
      // reported value is usually short of 100. Snap to done before flipping state.
      setDownloadProgress(100);
    } finally {
      PushNotifications.cancel('progress', downloadNotificationId);
    }
  };

  /**
   * Download a model. The vision projector (mmproj) of a multimodal model is NOT fetched here - the
   * user opts into that from the attachments sheet the first time they want to send an image
   * (see `utils/models/mmproj`).
   */
  const downloadModel = async (model: any, runPrefetchChecks = true) => {
    if (!!modelDownloadUrl) return false;

    const isDownloaded = await checkModelDownloaded(model.downloadUrl);
    if (isDownloaded) return await selectModel(model);

    // If prefetch checks are enabled, run them before downloading to abort early
    if (runPrefetchChecks) {
      const approved = await runPreDownloadConfirmations(model);
      if (!approved) return false;
    }

    setModelDownloadUrl(model.downloadUrl);
    const storageLocation = resolveDestinationPathFromGGUFUrl(model.downloadUrl);

    try {
      activateKeepAwake();
      uiStore.setSessionKey('@downloadInProgress', true, uiStore.globalEvents.MODEL_DOWNLOAD_STARTED);
      await downloadToStorage({
        fromUrl: model.downloadUrl,
        toFile: storageLocation,
        title: 'Downloading model',
        body: `Downloading ${model.modelId}`,
      });
      setDownloadedModels(prev => ({ ...prev, [model.modelId]: true }));
      PushNotifications.send('primary', {
        title: 'Download complete',
        body: `Downloaded ${model.modelId}`,
      });
      return await selectModel(model);
    } catch (error) {
      console.error('Download failed:', error);
      PushNotifications.send('primary', {
        title: 'Download failed',
        body: `There was an error downloading the model.`,
      });
      await AwaitableAlert(
        'Download failed',
        'There was an error downloading the model.',
        { text: 'Dismiss', style: 'default' },
        { text: 'OK', style: 'default' }
      );
      return false;
    } finally {
      // Always clear the active download so cards leave the progress state on
      // success as well as failure - previously this only happened in the catch.
      setModelDownloadUrl(null);
      setDownloadProgress(0);
      deactivateKeepAwake();
      uiStore.deleteSessionKey('@downloadInProgress', uiStore.globalEvents.MODEL_DOWNLOAD_COMPLETE);
    }
  };


  const uninstallModel = async (model: any) => {
    const shouldUninstall = await AwaitableAlert(
      'Uninstall model?',
      'This will remove the model from your device.',
      { text: 'Cancel', style: 'cancel' },
      { text: 'Uninstall', style: 'destructive' },
    );

    if (!shouldUninstall) return false;

    try {
      const path = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
      // Models added from Hugging Face only exist while installed - drop the entry too.
      if (model.isImported) await ImportedModels.remove(model.modelId);
      if (model.mmproj?.downloadUrl) {
        const mmprojPath = resolveDestinationPathFromGGUFUrl(model.mmproj.downloadUrl);
        if (await RNFS.exists(mmprojPath)) await RNFS.unlink(mmprojPath).catch(() => { });
      }
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);

        // Update downloaded models state
        setDownloadedModels(prev => ({
          ...prev,
          [model.modelId]: false,
        }));

        // If this was the selected model, clear the selection
        if (selectedModel === model.modelId) {
          setSelectedModel(null);
          await uiStore.setToStorage('llmPreference', {
            ...llmPreferences,
            config: { ...llmPreferences.config, model: null },
          });
          await fetchLLMPreference();
        }
        return true;
      }
      if (model.isImported && selectedModel === model.modelId) {
        setSelectedModel(null);
        await uiStore.setToStorage('llmPreference', {
          ...llmPreferences,
          config: { ...llmPreferences.config, model: null },
        });
        await fetchLLMPreference();
      }
      return model.isImported === true;
    } catch (error) {
      console.error('Failed to uninstall model:', error);
      return false;
    }
  };

  const selectModel = async (model: { modelId?: string }) => {
    try {
      // Set selected model state first
      setSelectedModel(model?.modelId || null);

      console.log('selectModel::llmPreferences', llmPreferences);
      console.log('selectModel::model.modelId', model?.modelId);
      // Then update preferences
      await uiStore.setToStorage('llmPreference', {
        provider: llmPreferences?.provider ?? 'native', // if the provider is not set, default to native
        config: { ...llmPreferences.config, model: model?.modelId || null },
      });

      // Only fetch preferences if we need to
      if (model?.modelId !== llmPreferences.config.model) {
        await fetchLLMPreference();
      }
      return true;
    } catch (error) {
      console.error('Failed to select model:', error);
      return false;
    }
  };

  /**
   * Check if a model is downloaded
   * @param downloadUrl - The download URL of the model to check against
   */
  const checkModelDownloaded = async (downloadUrl: string): Promise<boolean> => {
    const storageLocation = resolveDestinationPathFromGGUFUrl(downloadUrl);
    return await RNFS.exists(storageLocation);
  };

  return {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    uninstallModel,
    selectModel,
    runPreDownloadConfirmations,
  };
}