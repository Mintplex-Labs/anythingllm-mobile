import { View, Text, TouchableOpacity } from 'react-native';
import ModelCard from '@/components/TopBar/ModelChip/ModelCard';
import { useState, useEffect } from 'react';
import useModelManager from '@/hooks/useModelManager';

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
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showAllModels, setShowAllModels] = useState(false);

  const {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    uninstallModel,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  useEffect(() => {
    if (LLMProvider) {
      const models = LLMProvider.availableModels();
      setAvailableModels(models);
    } else setAvailableModels([]);
  }, [LLMProvider]);

  const displayedModels = showAllModels
    ? availableModels
    : availableModels.filter(model => model.isPreset);

  return (
    <View
      style={{ backgroundColor: '#0E0F0F' }}
      className="flex flex-col gap-y-4">
      <Text className="text-[#9F9FA0] text-sm font-semibold">LLM Model*</Text>
      {displayedModels.map((model, index) => (
        <ModelCard
          key={`settings-${model.modelId}-${index}`}
          model={model}
          isSelected={selectedModel === model.modelId}
          isDownloaded={downloadedModels[model.modelId]}
          modelDownloadUrl={modelDownloadUrl}
          downloadProgress={downloadProgress}
          onSelect={() => downloadModel(model)}
          onUninstall={() => uninstallModel(model)}
        />
      ))}
      {availableModels.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowAllModels(!showAllModels)}
          className="flex flex-row items-center justify-center py-2">
          <Text className="text-[#9F9FA0] text-sm">
            {showAllModels ? 'Show Less' : 'View More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
