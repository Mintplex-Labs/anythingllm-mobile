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
  TextInput,
  Keyboard,
  Image,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import { ArrowsClockwise, Check, MagnifyingGlass, Tag, WarningCircle, X } from 'phosphor-react-native';
import { findIconByModelName, findIconByProvider } from '@/components/MonoProviderIcon';
import useLlmPreference from '@/hooks/useLLMPreference';
import useModelManager from '@/hooks/useModelManager';
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from '@/contexts/BottomSheetContext';
import ModelCard from '@/components/ModelCard';
import {
  flattenModelSections,
  groupModelsByProvider,
  ProviderSectionHeader,
} from '@/components/ModelCard/ProviderSections';
import { defaultModels } from '@/utils/models';
import { Model } from '@/utils/types';
import { WorkspaceType } from '@/database/models/Workspace';
import { showToast } from '@/utils/Notification';
import uiStore from '@/store/UIStore';
import { AVAILABLE_LLM_PROVIDERS } from '@/utils/llmproviders';
import HuggingFaceImport from '@/components/HuggingFaceImport';
import AddFromHuggingFaceCard from '@/components/HuggingFaceImport/AddCard';
import ImportedModels, { ImportedModel } from '@/utils/models/imported';
import { IAvailableModel } from '@/utils/AiProviders/baseOpenAILikeProvider';

function getPresetModelName(llmPreferences: { provider: string; config: any }) {
  if (llmPreferences.provider !== 'native') return llmPreferences.config.model;
  const modelDefinition = defaultModels.find(model => model.id === llmPreferences.config.model) as Model;
  return modelDefinition?.name || llmPreferences.config.model;
}

function modelNameToDisplayName(modelName?: string | null) {
  if (!modelName) return null; // undetermined model

  // Full file path specific (windows: C:\Users\...\..., mac: /Users/...\...)
  if (modelName.includes('\\') || modelName.startsWith('/')) {
    return modelName.split(/[\\/]/).pop()?.replaceAll(new RegExp('[-.]?gguf$', 'gi'), '') // Remove -gguf/.gguf suffix
      ?.replaceAll(new RegExp('[-_]', 'g'), ' ') // Replace - and _ with space
      ?.replaceAll(new RegExp('chat -*', 'g'), '') // Replace cgguf with gguf
      ?.replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  // General model name format: <provider>/<model-name>
  return modelName
    .split('/')
    .pop()
    ?.replaceAll(new RegExp('[-.]?gguf$', 'gi'), '') // Remove -gguf/.gguf suffix
    ?.replaceAll(new RegExp('-', 'g'), ' ') // Replace - with space
    ?.replace(/^./, str => str.toUpperCase()); // Capitalize first letter
}

export default function ModelChip({ workspace }: { workspace: WorkspaceType }) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const { llmPreferences, LLMProvider } = useLlmPreference();
  const [modelName, setModelName] = useState<string | null>(null);

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

  /**
   * Fetch the model name from the remote workspace.
   * Updates the state of the model name as well
   */
  async function fetchRemoteModelName() {
    if (!workspace?.isRemote) return null;
    const model = await workspace.remoteModelTag();
    setModelName(model);
  }

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION, bottomSheetRef);
  }, [registerSheet]);

  useEffect(() => {
    if (workspace?.isRemote) {
      fetchRemoteModelName();
      uiStore.emitter.addListener(uiStore.globalEvents.CHAT_HISTORY_REFRESHED, fetchRemoteModelName);
    } else setModelName(getPresetModelName(llmPreferences));

    return () => uiStore.emitter.removeAllListeners(uiStore.globalEvents.CHAT_HISTORY_REFRESHED);
    // llmPreferences loads async after mount - without it in the deps a chip mounted before the
    // preference resolved (Home, the loading view) stays on "No model loaded".
  }, [workspace, llmPreferences]);

  // If the model name is not set and the workspace is remote, we don't want to show the model chip
  // since it will show "No model loaded" which is confusing
  if (!modelName && workspace?.isRemote) return null;
  return (
    <Fragment>
      <TouchableOpacity
        onPress={() => {
          if (workspace?.isRemote) return showToast('This workspace is managed remotely. You cannot change the model here.');
          presentSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)
        }}
        style={{ marginTop: -5, maxWidth: 200 }}
        className={`rounded-full ${!modelName ? 'bg-red-500/20' : 'bg-white/10'
          }`}>
        <View className="flex flex-row items-center justify-center" style={{ gap: 4, paddingVertical: 4, paddingHorizontal: 12 }}>
          <ProviderIcon
            provider={llmPreferences.provider}
            // On-device `modelName` is the friendly display name; the raw id (eg. `unsloth/Qwen3.5-2B-GGUF`) matches more reliably.
            modelName={llmPreferences.provider === 'native' ? llmPreferences.config?.model || modelName : modelName}
          />
          <Text
            style={{ fontSize: 14 }}
            className={`${!modelName ? 'text-red-500' : 'text-white'}`}
            numberOfLines={1}
            ellipsizeMode="middle">
            {modelNameToDisplayName(modelName) || 'No model loaded'}
          </Text>
        </View>
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
        enablePanDownToClose={true}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}>
        {LLMProvider?.isExternalProvider
          ? <ExternalProviderModels bottomSheetRef={bottomSheetRef} />
          : <AvailableModels bottomSheetRef={bottomSheetRef} />}
      </BottomSheetModal>
    </Fragment>
  );
}

export interface AvailableModel {
  id: string;
  name: string;
  size: number;
  modelId: string;
  downloadUrl: string;
  description: string;
  isPreset: boolean;
  provider?: string;
  isUnknown?: boolean;
  isImported?: boolean;
  imageUrl?: string | null;
}

function AvailableModels({
  bottomSheetRef,
}: {
  bottomSheetRef: React.RefObject<BottomSheetModal>;
}) {
  const { llmPreferences, LLMProvider, isLoading, fetchLLMPreference } = useLlmPreference();
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'import'>('list');
  const [importQuery, setImportQuery] = useState('');
  const searchInputRef = useRef(null);
  const isNative = llmPreferences.provider === 'native';

  const {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    uninstallModel,
    selectModel,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  const fetchModels = useCallback(async () => {
    // External providers (LM Studio, Ollama, OpenAI-compatible, ...) render
    // `ExternalProviderModels` instead - this sheet is on-device only.
    if (LLMProvider && !LLMProvider.isExternalProvider) {
      const models = await LLMProvider.availableModels() as AvailableModel[];
      setAvailableModels(models);
    } else setAvailableModels([]);
  }, [LLMProvider]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const openImport = (prefill = '') => {
    setImportQuery(prefill);
    setView('import');
  };

  /**
   * The user picked a quant in the import view: remember it so it shows up in the
   * list (and survives restarts), then hand it to the regular download flow so the
   * usual network / size confirmations and progress reporting apply.
   */
  const importAndDownload = async (imported: ImportedModel) => {
    await ImportedModels.add(imported);
    await fetchModels();
    setView('list');
    setSearchQuery('');
    const model: AvailableModel = {
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
    return downloadModel(model);
  };

  const filteredModels = useMemo(() => {
    return availableModels.filter(
      model =>
        (model.name || model.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (model.description || '')
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  }, [availableModels, searchQuery]);

  // Presets first, then grouped by provider, then anything found in storage we don't recognise.
  const listItems = useMemo(
    () => flattenModelSections(groupModelsByProvider(filteredModels)),
    [filteredModels],
  );

  if (isLoading) return <ActivityIndicator size="large" color="white" />;

  if (view === 'import') {
    return (
      <View className="flex flex-col w-full h-full pt-2">
        <HuggingFaceImport
          initialQuery={importQuery}
          onDownload={importAndDownload}
          installedModelIds={availableModels.filter(m => m.isImported && downloadedModels[m.modelId]).map(m => m.modelId)}
          activeDownloadUrl={modelDownloadUrl}
          downloadProgress={downloadProgress}
          onBack={() => setView('list')}
          onInputFocus={() => bottomSheetRef.current?.snapToIndex(1)}
        />
      </View>
    );
  }

  return (
    <View className="flex flex-col items-center justify-center gap-y-4 w-full h-full">
      <View className="flex flex-row items-center mx-6 bg-[#27282A] rounded-lg px-4">
        <MagnifyingGlass size={20} weight="bold" color="white" />
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor="#9F9FA0"
          className="flex-1 h-[38px] ml-2 text-white"
          scrollEnabled={false}
          onFocus={() => {
            bottomSheetRef.current?.snapToIndex(1);
            const keyboardListener = Keyboard.addListener(
              'keyboardDidShow',
              () => {
                bottomSheetRef.current?.snapToIndex(1);
              },
            );

            return () => {
              keyboardListener.remove();
            };
          }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>
      {!filteredModels.length && (
        <View className="w-full px-5" style={{ gap: 12 }}>
          <Text className="text-white text-sm text-center pt-4">
            No models found for "{searchQuery}"
          </Text>
          {isNative && (
            <AddFromHuggingFaceCard
              onPress={() => openImport(searchQuery)}
              hint={`Look up "${searchQuery}" on Hugging Face and download a GGUF version.`}
            />
          )}
        </View>
      )}
      {filteredModels.length > 0 && (
        <BottomSheetFlatList
          data={listItems}
          keyExtractor={item => item.key}
          className="w-full"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 100,
            gap: 10,
          }}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          ListFooterComponent={isNative ? <AddFromHuggingFaceCard onPress={() => openImport()} /> : null}
          renderItem={({ item }) => {
            if (item.type === 'header') return <ProviderSectionHeader title={item.title} />;

            const model = item.model;
            return (
              <ModelCard
                model={model}
                isSelected={selectedModel === model.modelId}
                isDownloaded={downloadedModels[model.modelId]}
                modelDownloadUrl={modelDownloadUrl}
                downloadProgress={downloadProgress}
                onSelect={() => {
                  if (llmPreferences.provider === 'native') return downloadModel(model);
                  else return selectModel({ modelId: model.id }); // Generic OpenAI /models results
                }}
                onUninstall={() => uninstallModel(model)}
              />
            );
          }}
        />
      )}
    </View>
  );
}

/**
 * Model picker for external providers (OpenAI, OpenRouter, Ollama, LM Studio, generic OpenAI).
 * Lists whatever the provider's `/models` endpoint returns and swaps the saved model in place.
 * Providers that cannot list models (or a generic endpoint without `/models`) get an error
 * state pointing the user to the settings screen instead.
 */
function ExternalProviderModels({
  bottomSheetRef,
}: {
  bottomSheetRef: React.RefObject<BottomSheetModal>;
}) {
  const { llmPreferences, LLMProvider, updateLLMPreference, providerToName } = useLlmPreference();
  const { dismissSheet } = useBottomSheet();
  const [models, setModels] = useState<IAvailableModel[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const providerName = providerToName(llmPreferences.provider);
  const currentModelId: string | undefined = llmPreferences.config?.model;
  const { baseUrl, apiKey } = llmPreferences.config || {};
  // Picking a model rebuilds the provider instance; reading it through a ref keeps that from
  // re-triggering the fetch - only a change to the connection itself should reload the list.
  const providerRef = useRef(LLMProvider);
  providerRef.current = LLMProvider;

  const fetchModels = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;
    setStatus('loading');
    try {
      // Every provider swallows its own request errors and resolves to `[]`, so an
      // empty list is our only signal that the endpoint is missing or unreachable.
      // The provider union has differing `availableModels` signatures; external providers all
      // resolve to the OpenAI `/models` shape.
      const result = await (provider as { availableModels: () => Promise<IAvailableModel[]> }).availableModels();
      const found = (Array.isArray(result) ? result : []).filter(model => !!model?.id);
      if (!found.length) throw new Error('No models returned');
      setModels(found);
      setStatus('ready');
    } catch (error) {
      console.log(`[ModelChip] Could not list models for ${llmPreferences.provider}`, error);
      setModels([]);
      setStatus('error');
      showToast(`Could not list models for ${providerName}.`, 'long');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmPreferences.provider, baseUrl, apiKey, providerName]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return models;
    return models.filter(model =>
      model.id.toLowerCase().includes(query) ||
      ((model as { name?: string }).name || '').toLowerCase().includes(query),
    );
  }, [models, searchQuery]);

  const selectModel = async (modelId: string) => {
    if (isSaving) return;
    if (modelId === currentModelId) return dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION);
    setIsSaving(true);
    try {
      await updateLLMPreference(llmPreferences.provider, { ...llmPreferences.config, model: modelId });
      dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION);
    } catch (error) {
      console.error('[ModelChip] Failed to switch model', error);
      showToast('Could not switch model. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <View className="flex flex-col items-center justify-center w-full h-full" style={{ gap: 12, paddingBottom: 100 }}>
        <ActivityIndicator size="large" color="white" />
        <Text className="text-[#9F9FA0] text-sm">Loading models from {providerName}...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View className="flex flex-col items-center justify-center w-full h-full px-8" style={{ gap: 12, paddingBottom: 100 }}>
        <WarningCircle size={40} color="#f87171" weight="bold" />
        <Text className="text-white text-base font-semibold text-center">
          Could not list models for {providerName}
        </Text>
        <Text className="text-[#9F9FA0] text-sm text-center">
          This provider did not return any models. Check that the endpoint is reachable and supports model listing, or set the model manually in Settings.
        </Text>
        <TouchableOpacity
          onPress={fetchModels}
          className="flex flex-row items-center bg-white/10 rounded-lg px-4 py-2 mt-2"
          style={{ gap: 6 }}>
          <ArrowsClockwise size={16} color="white" weight="bold" />
          <Text className="text-white text-sm font-medium">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex flex-col items-center justify-center gap-y-4 w-full h-full">
      <View className="flex flex-row items-center mx-6 bg-[#27282A] rounded-lg px-4">
        <MagnifyingGlass size={20} weight="bold" color="white" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Search ${providerName} models`}
          placeholderTextColor="#9F9FA0"
          className="flex-1 h-[38px] ml-2 text-white"
          scrollEnabled={false}
          onFocus={() => bottomSheetRef.current?.snapToIndex(1)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>
      {!filteredModels.length && (
        <Text className="text-white text-sm text-center pt-4 px-5">
          No models found for "{searchQuery}"
        </Text>
      )}
      {filteredModels.length > 0 && (
        <BottomSheetFlatList
          data={filteredModels}
          keyExtractor={model => model.id}
          className="w-full"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 8 }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: model }) => {
            const isSelected = model.id === currentModelId;
            const displayName = (model as { name?: string }).name;
            return (
              <TouchableOpacity
                disabled={isSaving}
                onPress={() => selectModel(model.id)}
                style={{
                  backgroundColor: isSelected ? '#2e404b' : '#2A2A2E',
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: isSelected ? '#7cd4fd' : 'transparent',
                }}
                className="w-full p-4 rounded-xl flex-row items-center justify-between">
                <View className="flex-1" style={{ gap: 2 }}>
                  <Text className="text-white text-base font-medium" numberOfLines={1}>
                    {displayName || model.id}
                  </Text>
                  {!!displayName && displayName !== model.id && (
                    <Text className="text-[#9F9FA0] text-xs" numberOfLines={1}>{model.id}</Text>
                  )}
                </View>
                {isSelected && <Check size={20} color="#7cd4fd" weight="bold" style={{ marginLeft: 12 }} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const CHIP_ICON_SIZE = 15;
const CHIP_ICON_STYLE = { marginRight: 4 };

/**
 * Small brand mark shown next to the model name in the chip.
 *  - On-device: there is no provider logo, so we match the model itself (Qwen, Gemma, Granite, ...).
 *  - External providers: the provider's mark (Ollama, LM Studio, OpenAI, ...). When we have no mark
 *    for the provider we try the model name instead, then the legacy png logo, then a generic tag.
 */
function ProviderIcon({ provider, modelName }: { provider: string; modelName?: string | null }) {
  if (!modelName) return null; // Nothing loaded - the chip already reads "No model loaded".

  const MonoIcon =
    provider === 'native'
      ? findIconByModelName(modelName)
      : findIconByProvider(provider) || findIconByModelName(modelName);
  if (MonoIcon) return <MonoIcon width={CHIP_ICON_SIZE} height={CHIP_ICON_SIZE} color="#ffffff" style={CHIP_ICON_STYLE} />;

  const legacyLogo = AVAILABLE_LLM_PROVIDERS.find(p => p.value === provider)?.logo;
  if (provider !== 'native' && legacyLogo) {
    return <Image source={legacyLogo} style={{ width: CHIP_ICON_SIZE, height: CHIP_ICON_SIZE, ...CHIP_ICON_STYLE }} />;
  }

  return <Tag size={CHIP_ICON_SIZE} color="#ffffff" weight="bold" style={CHIP_ICON_STYLE} />;
}