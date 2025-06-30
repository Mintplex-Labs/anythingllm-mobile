import useModelManager from '@/hooks/useModelManager';
import { Text, TouchableOpacity } from 'react-native';
import ModelCard from '@/components/ModelCard';
import { useState, useEffect, Fragment } from 'react';

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
    <Fragment>
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
    </Fragment>
  );
}
