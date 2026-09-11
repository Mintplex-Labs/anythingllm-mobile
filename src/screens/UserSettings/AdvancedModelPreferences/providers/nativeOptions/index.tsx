import useModelManager from '@/hooks/useModelManager';
import { Modal, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import ModelCard from '@/components/ModelCard';
import { groupModelsByProvider, ProviderSectionHeader } from '@/components/ModelCard/ProviderSections';
import { useState, useEffect, Fragment, useCallback } from 'react';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import * as RNFS from '@dr.pogodin/react-native-fs';
import HuggingFaceImport from '@/components/HuggingFaceImport';
import AddFromHuggingFaceCard from '@/components/HuggingFaceImport/AddCard';
import ImportedModels, { ImportedModel } from '@/utils/models/imported';

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
  const [showImport, setShowImport] = useState(false);
  const {
    modelDownloadUrl,
    downloadProgress,
    selectedModel,
    downloadModel,
    uninstallModel,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  const fetchModels = useCallback(async () => {
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
  }, [LLMProvider]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  /**
   * The user picked a quant in the import modal: persist it, refresh the list so the
   * new card is visible with its progress bar, then run the regular download flow.
   */
  const importAndDownload = async (imported: ImportedModel) => {
    await ImportedModels.add(imported);
    await fetchModels();
    setShowImport(false);
    const started = await downloadModel({
      id: imported.modelId,
      modelId: imported.modelId,
      name: imported.name,
      description: imported.description,
      size: imported.size,
      downloadUrl: imported.downloadUrl,
      isPreset: false,
      isImported: true,
      provider: imported.author,
    });
    await fetchModels(); // pick up isDownloaded once the download settles
    return started;
  };

  const handleUninstall = async (model: any) => {
    const removed = await uninstallModel(model);
    if (removed) await fetchModels();
    return removed;
  };

  // Always show the currently selected model, even when it is not a preset,
  // so a model found in storage that is no longer in our list is still visible.
  // Models the user added from Hugging Face are always shown too.
  const displayedModels = showAllModels
    ? availableModels
    : availableModels.filter(model => model.isPreset || model.isImported || model.modelId === selectedModel);

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
              onUninstall={() => handleUninstall(model)}
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
      <AddFromHuggingFaceCard onPress={() => setShowImport(true)} />

      <Modal
        visible={showImport}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowImport(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1B1B1E' }}>
          <View className="flex-1 pt-3">
            <HuggingFaceImport
              onDownload={importAndDownload}
              installedModelIds={availableModels.filter(m => m.isImported && m.isDownloaded).map(m => m.modelId)}
              activeDownloadUrl={modelDownloadUrl}
              downloadProgress={downloadProgress}
              onBack={() => setShowImport(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Fragment>
  );
}
