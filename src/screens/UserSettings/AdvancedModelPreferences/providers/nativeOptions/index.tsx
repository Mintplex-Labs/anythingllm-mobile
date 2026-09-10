import useModelManager from '@/hooks/useModelManager';
import { Text, TouchableOpacity } from 'react-native';
import ModelCard from '@/components/ModelCard';
import { groupModelsByProvider, ProviderSectionHeader } from '@/components/ModelCard/ProviderSections';
import { useState, useEffect, Fragment } from 'react';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import * as RNFS from '@dr.pogodin/react-native-fs';

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
    selectedModel,
    downloadModel,
    uninstallModel,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  useEffect(() => {
    async function fetchModels() {
      if (LLMProvider) {
        const models = await (LLMProvider as OnDeviceProvider).availableModels();
        for (const model of models) {
          // @ts-ignore
          const path = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
          // @ts-ignore
          model.isDownloaded = await RNFS.exists(path);
        }
        setAvailableModels(models);
      } else setAvailableModels([]);
    }
    fetchModels();
  }, [LLMProvider]);

  // Always show the currently selected model, even when it is not a preset,
  // so a model found in storage that is no longer in our list is still visible.
  const displayedModels = showAllModels
    ? availableModels
    : availableModels.filter(model => model.isPreset || model.modelId === selectedModel);

  const sections = groupModelsByProvider(displayedModels);

  return (
    <Fragment>
      {sections.map((section, sectionIndex) => (
        <Fragment key={`section-${section.title ?? 'presets'}`}>
          {section.title && <ProviderSectionHeader title={section.title} />}
          {section.models.map((model, index) => (
            <ModelCard
              key={`settings-${sectionIndex}-${model.modelId}-${index}`}
              model={model}
              isSelected={selectedModel === model.modelId}
              isDownloaded={model.isDownloaded}
              modelDownloadUrl={modelDownloadUrl}
              downloadProgress={downloadProgress}
              onSelect={() => downloadModel(model)}
              onUninstall={() => uninstallModel(model)}
            />
          ))}
        </Fragment>
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
