import { useState, useEffect } from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { useNetInfo } from '@react-native-community/netinfo';
import { formatBytes } from '@/utils/formatters';
import AwaitableAlert from '@/components/AwaitableAlert';
import uiStore from '@/store/UIStore';
import PushNotifications from '@/utils/PushNotifications';
import { activateKeepAwake, deactivateKeepAwake } from '@/utils/keepAwake';

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

    // Create the directory if it doesn't exist
    const dirPath = storageLocation.substring(0, storageLocation.lastIndexOf('/'));
    await RNFS.mkdir(dirPath, { NSURLIsExcludedFromBackupKey: true });

    const downloadNotificationId = await PushNotifications.send('progress', {
      title: 'Downloading model',
      body: `Downloading ${model.modelId}`,
      android: {
        progress: {
          indeterminate: true,
        },
      },
    });

    try {
      activateKeepAwake();
      uiStore.setSessionKey('@downloadInProgress', true, uiStore.globalEvents.MODEL_DOWNLOAD_STARTED);
      await RNFS.downloadFile({
        fromUrl: model.downloadUrl,
        toFile: storageLocation,
        progress: res => {
          const progress = Math.round((res.bytesWritten / res.contentLength) * 100);
          setDownloadProgress(progress);
          PushNotifications.send('progress', {
            id: downloadNotificationId,
            title: 'Downloading model',
            body: `Downloading ${model.modelId}`,
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
        progressInterval: 5000,
      }).promise;

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
      setModelDownloadUrl(null);
      setDownloadProgress(0);
      return false;
    } finally {
      deactivateKeepAwake();
      PushNotifications.cancel('progress', downloadNotificationId);
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
      return false;
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