import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { FlatList } from 'react-native-gesture-handler';
import useLlmPreference from '@/hooks/useLLMPreference';
import { Circle, DownloadSimple, Cube } from 'phosphor-react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import uiStore from '@/store/UIStore';
import AwaitableAlert from '@/components/AwaitableAlert';
import { formatBytes } from '@/utils/formatters';
import { useNetInfo } from '@react-native-community/netinfo';
import DownloadProgress from '@/screens/Onboarding/ModelSelection/DownloadProgress';
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from '@/contexts/BottomSheetContext';
import MODEL_CARDS from '@/utils/models/defaults';
import ModelCard from './ModelCard';

export default function ModelChip({ modelName }: { modelName?: string }) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );
  const parsedModelName = useMemo(() => {
    if (!modelName) return null;
    return modelName
      .split('/')
      .pop()
      ?.replaceAll(new RegExp('(-?)(gguf|GGUF|Gguf)$', 'g'), '') // Remove -gguf suffix
      ?.replaceAll(new RegExp('-', 'g'), ' ') // Replace - with space
      ?.replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }, [modelName]);

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION, bottomSheetRef);
  }, [registerSheet]);

  if (!modelName) return null;
  return (
    <Fragment>
      <TouchableOpacity
        onPress={() => presentSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}
        style={{ marginTop: -5, maxWidth: 200 }}
        className="bg-white/10 rounded-full">
        <Text
          style={{ fontSize: 14, paddingVertical: 4, paddingHorizontal: 12 }}
          className="text-white"
          numberOfLines={1}
          ellipsizeMode="middle">
          {parsedModelName || 'Unknown LLM'}
        </Text>
      </TouchableOpacity>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={['50%', '95%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#1B1B1E' }}
        handleIndicatorStyle={{
          backgroundColor: '#9F9FA0',
          width: 45,
          margin: 10,
        }}
        onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}>
        <AvailableModels
          closeSheet={() =>
            dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)
          }
        />
      </BottomSheetModal>
    </Fragment>
  );
}

interface AvailableModel {
  id: string;
  name: string;
  size: number;
  modelId: string;
  downloadUrl: string;
  description?: string;
  isPreset?: boolean;
  imageUrl?: string;
}

function AvailableModels({ closeSheet }: { closeSheet: () => void }) {
  const netInfo = useNetInfo();
  const { llmPreferences, LLMProvider, isLoading, fetchLLMPreference } =
    useLlmPreference();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelDownloadUrl, setModelDownloadUrl] = useState<string | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<{
    [key: string]: boolean;
  }>({});
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Check which models are downloaded
  useEffect(() => {
    async function checkDownloadedModels() {
      const downloadStatus = {};
      for (const model of availableModels) {
        const storageLocation = resolveDestinationPathFromGGUFUrl(
          model.downloadUrl,
        );
        const isDownloaded = await RNFS.exists(storageLocation);
        downloadStatus[model.modelId] = isDownloaded;
      }
      setDownloadedModels(downloadStatus);
    }
    checkDownloadedModels();
  }, [availableModels]);

  async function completeModelSelection(model: AvailableModel) {
    setSelectedModel(model.modelId);
    await uiStore.setToStorage('llmPreference', {
      ...llmPreferences,
      config: { ...llmPreferences.config, model: model.modelId },
    });
    await fetchLLMPreference();
    setModelDownloadUrl(null);
    closeSheet();
  }

  async function handleModelSelection(model: AvailableModel) {
    if (!!modelDownloadUrl) return;

    const storageLocation = resolveDestinationPathFromGGUFUrl(
      model.downloadUrl,
    );
    const isDownloaded = await RNFS.exists(storageLocation);
    if (isDownloaded) return completeModelSelection(model);

    const modelSize =
      typeof model.size === 'number' ? formatBytes(model.size) : model.size;
    if (!netInfo.isConnected)
      return Alert.alert(
        'No internet connection.',
        'You will need to be connected to the internet to download any model.',
      );

    if (netInfo.type !== 'wifi') {
      const ignoreWarning = await AwaitableAlert(
        'Data usage warning',
        `We recommend using a Wi-Fi connection to download the model since it's ${modelSize} in size.`,
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue Anyway', style: 'default' },
      );
      if (!ignoreWarning) return;
    }

    const shouldDownload = await AwaitableAlert(
      'Download model?',
      `This will download the model to your device. It is ${modelSize} in size.`,
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue with download', style: 'default' },
    );
    if (!shouldDownload) return;
    setModelDownloadUrl(model.downloadUrl);

    // Start download with progress tracking
    const downloadOptions = {
      fromUrl: model.downloadUrl,
      toFile: storageLocation,
      progress: res => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        setDownloadProgress(Math.round(progress));
      },
      background: true,
    };

    try {
      await RNFS.downloadFile(downloadOptions).promise;
      await completeModelSelection(model);
    } catch (error) {
      console.error('Download failed:', error);
      Alert.alert(
        'Download failed',
        'There was an error downloading the model.',
      );
      setModelDownloadUrl(null);
      setDownloadProgress(0);
    }
  }

  useEffect(() => {
    if (LLMProvider) {
      setAvailableModels(LLMProvider.availableModels() as AvailableModel[]);
      setSelectedModel(LLMProvider.model);
    } else setAvailableModels([]);
  }, [LLMProvider]);

  const getModelIcon = (model: AvailableModel) => {
    if (model.imageUrl) {
      return (
        <Image
          source={{ uri: model.imageUrl }}
          style={{ width: 24, height: 24 }}
          resizeMode="contain"
        />
      );
    }
    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    const Icon = defaultCard?.Icon || Cube;
    return <Icon size={24} color="#000" />;
  };

  if (isLoading) return <ActivityIndicator size="large" color="white" />;

  let seenAllPresets = 0;
  return (
    <View className="flex flex-col items-center justify-center gap-y-4 w-full h-full">
      <Text className="text-white text-lg font-semibold py-4">
        Choose your model
      </Text>
      {!availableModels.length && (
        <Text className="text-white text-sm">No models available</Text>
      )}
      {availableModels.length > 0 && (
        <FlatList
          data={availableModels}
          className="w-full"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 100,
            gap: 10,
          }}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          renderItem={({ item }) => {
            const isCurrentlySelected = selectedModel === item.modelId;
            const isDownloaded = downloadedModels[item.modelId];
            if (!item.isPreset) seenAllPresets++;

            return (
              <Fragment>
                {seenAllPresets === 1 && (
                  <View
                    style={{
                      paddingVertical: 10,
                      position: 'relative',
                      opacity: 0.75,
                    }}
                    className="w-full flex flex-row items-center justify-center w-full">
                    <View
                      style={{
                        height: 1,
                        backgroundColor: '#9F9FA0',
                        borderRadius: 100,
                      }}
                      className="flex flex-1 w-full"
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        color: '#9F9FA0',
                        paddingHorizontal: 10,
                        zIndex: 2,
                      }}
                      className="text-white text-sm">
                      Additional LLMs
                    </Text>
                    <View
                      style={{
                        height: 1,
                        backgroundColor: '#9F9FA0',
                        borderRadius: 100,
                      }}
                      className="flex flex-1 w-full"
                    />
                  </View>
                )}
                <ModelCard
                  model={item}
                  isSelected={isCurrentlySelected}
                  isDownloaded={isDownloaded}
                  modelDownloadUrl={modelDownloadUrl}
                  downloadProgress={downloadProgress}
                  onSelect={() => handleModelSelection(item)}
                  onUninstall={async () => {
                    const storageLocation = resolveDestinationPathFromGGUFUrl(
                      item.downloadUrl,
                    );
                    const shouldUninstall = await AwaitableAlert(
                      'Uninstall model?',
                      'This will remove the model from your device.',
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Uninstall', style: 'destructive' },
                    );
                    if (shouldUninstall) {
                      await RNFS.unlink(storageLocation);
                      setDownloadedModels({
                        ...downloadedModels,
                        [item.modelId]: false,
                      });
                      if (selectedModel === item.modelId) {
                        await uiStore.setToStorage('llmPreference', {
                          ...llmPreferences,
                          config: {
                            ...llmPreferences.config,
                            model: null,
                          },
                        });
                        await fetchLLMPreference();
                      }
                    }
                  }}
                />
              </Fragment>
            );
          }}
        />
      )}
    </View>
  );
}
