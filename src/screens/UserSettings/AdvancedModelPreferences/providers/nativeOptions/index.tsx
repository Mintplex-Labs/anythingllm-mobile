import useModelManager from '@/hooks/useModelManager';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ModelCard from '@/components/ModelCard';
import { groupModelsByProvider, ProviderSectionHeader } from '@/components/ModelCard/ProviderSections';
import { useState, useEffect, Fragment, useCallback, useMemo } from 'react';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import * as RNFS from '@dr.pogodin/react-native-fs';
import HuggingFaceImport from '@/components/HuggingFaceImport';
import AddFromHuggingFaceCard from '@/components/HuggingFaceImport/AddCard';
import ImportedModels, { ImportedModel } from '@/utils/models/imported';
import useModelFit from '@/hooks/useModelFit';
import { consumePendingHfPull, PendingHfPull } from '@/utils/DeepLinks';

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
  // Set when the picker was opened by an anythingllm://pull-hf link: the repo to show and the file to highlight.
  const [importPull, setImportPull] = useState<PendingHfPull | null>(null);
  const {
    modelDownloadUrl,
    downloadProgress,
    selectedModel,
    downloadModel,
    uninstallModel,
    runPreDownloadConfirmations,
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

  // Hugging Face "Use this model" deep link: open the picker on the requested repo with the file
  // highlighted. Downloading still goes through the regular confirmation in `downloadModel`.
  useEffect(() => {
    const pull = consumePendingHfPull();
    if (!pull) return;
    setImportPull(pull);
    setShowImport(true);
  }, []);

  const closeImport = () => {
    setShowImport(false);
    setImportPull(null);
  };

  /**
   * The user picked a quant in the import modal. Run the usual network / size confirmations
   * while the modal is still up so a "Cancel" leaves them on the quant list. Once approved:
   * persist it, refresh the list so the new card is visible with its progress bar, close the
   * modal and download.
   */
  const importAndDownload = async (imported: ImportedModel) => {
    const model = {
      id: imported.modelId,
      modelId: imported.modelId,
      name: imported.name,
      description: imported.description,
      size: imported.size,
      downloadUrl: imported.downloadUrl,
      isPreset: false,
      isImported: true,
      provider: imported.author,
    };
    const onDisk = await RNFS.exists(resolveDestinationPathFromGGUFUrl(model.downloadUrl));
    if (!onDisk && !(await runPreDownloadConfirmations(model))) return false;
    await ImportedModels.add(imported);
    await fetchModels();
    closeImport();
    const started = await downloadModel(model, false);
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

  // Memory badges for every row plus a "Recommended" callout on the preset that suits this phone.
  const presets = useMemo(() => availableModels.filter(model => model.isPreset), [availableModels]);
  const { fitFor, recommendedId } = useModelFit(presets);

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
              memoryFit={fitFor(model)}
              isRecommended={model.id === recommendedId}
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
        onRequestClose={closeImport}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#1B1B1E' }}>
          <View className="flex-1 pt-3">
            <HuggingFaceImport
              initialQuery={importPull?.repo ?? ''}
              highlightFilename={importPull?.file ?? undefined}
              onDownload={importAndDownload}
              installedModelIds={availableModels.filter(m => m.isImported && m.isDownloaded).map(m => m.modelId)}
              activeDownloadUrl={modelDownloadUrl}
              downloadProgress={downloadProgress}
              onBack={closeImport}
              useStandardFlatList
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Fragment>
  );
}
