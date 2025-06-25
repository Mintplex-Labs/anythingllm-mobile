import { View, Text, TouchableOpacity, Alert } from 'react-native';
import ModelCard from '@/screens/Onboarding/ModelSelection/Simple/ModelCard';
import { Cube } from 'phosphor-react-native';
import { Image } from 'react-native';
import MODEL_CARDS from '@/utils/models/defaults';
import { useState, useEffect } from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import uiStore from '@/store/UIStore';
import AwaitableAlert from '@/components/AwaitableAlert';
import { formatBytes } from '@/utils/formatters';
import { useNetInfo } from '@react-native-community/netinfo';

interface NativeOptionsProps {
  llmPreferences: any;
  fetchLLMPreference: () => Promise<void>;
  LLMProvider: any;
}

export default function NativeOptions({
  llmPreferences,
  fetchLLMPreference,
  LLMProvider,
}: NativeOptionsProps) {
  const netInfo = useNetInfo();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [modelDownloadUrl, setModelDownloadUrl] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);

  useEffect(() => {
    if (LLMProvider) {
      setAvailableModels(LLMProvider.availableModels());
      setSelectedModel(LLMProvider.model);
    } else setAvailableModels([]);
  }, [LLMProvider]);

  const displayedModels = showAllModels
    ? availableModels
    : availableModels.filter(model => model.isPreset);

  const getModelIcon = (model: any) => {
    if (model.imageUrl) {
      return ({ size }: { size: number }) => (
        <Image
          source={{ uri: model.imageUrl }}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      );
    }

    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    return defaultCard?.Icon || Cube;
  };

  async function completeModelSelection(model: any) {
    if (!!modelDownloadUrl) return;

    setSelectedModel(model.modelId);
    await uiStore.setToStorage('llmPreference', {
      ...llmPreferences,
      config: { ...llmPreferences.config, model: model.modelId },
    });
    await fetchLLMPreference();
    setModelDownloadUrl(null);
  }

  async function handleModelSelection(model: any) {
    if (selectedModel === model.modelId) return;
    if (!!modelDownloadUrl) return;

    const storageLocation = resolveDestinationPathFromGGUFUrl(
      model.downloadUrl,
    );
    const isDownloaded = await RNFS.exists(storageLocation);
    if (isDownloaded) {
      setSelectedModel(model.modelId);
      await uiStore.setToStorage('llmPreference', {
        ...llmPreferences,
        config: { ...llmPreferences.config, model: model.modelId },
      });
      return;
    }

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
  }

  return (
    <View
      style={{ backgroundColor: '#0E0F0F' }}
      className="flex flex-col gap-y-4">
      <Text className="text-[#9F9FA0] text-sm font-semibold">LLM Model*</Text>
      {displayedModels.map((model, index) => (
        <ModelCard
          key={`${model.modelId}-${index}`}
          id={model.modelId}
          name={model.name}
          description={model.description || ''}
          Icon={getModelIcon(model)}
          tag={model.downloadUrl}
          active={selectedModel === model.modelId}
          onPress={() => handleModelSelection(model)}
          downloadInProgress={!!modelDownloadUrl}
          downloadUrl={modelDownloadUrl}
          onDownloadComplete={() => completeModelSelection(model)}
        />
      ))}

      {!showAllModels && (
        <TouchableOpacity
          className="mt-4"
          onPress={() => setShowAllModels(true)}
          disabled={!!modelDownloadUrl}>
          <Text className="text-white text-center">View More</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
