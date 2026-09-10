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
} from '@gorhom/bottom-sheet';
import { FlatList } from 'react-native-gesture-handler';
import { MagnifyingGlass, Tag, X } from 'phosphor-react-native';
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

function getPresetModelName(llmPreferences: { provider: string; config: any }) {
  if (llmPreferences.provider !== 'native') return llmPreferences.config.model;
  const modelDefinition = defaultModels.find(model => model.id === llmPreferences.config.model) as Model;
  return modelDefinition?.name || llmPreferences.config.model;
}

function modelNameToDisplayName(modelName?: string | null) {
  if (!modelName) return null; // undetermined model

  // Full file path specific (windows: C:\Users\...\..., mac: /Users/...\...)
  if (modelName.includes('\\') || modelName.startsWith('/')) {
    return modelName.split(/[\\/]/).pop()?.replaceAll(new RegExp('(-?)(gguf|GGUF|Gguf)$', 'g'), '') // Remove -gguf suffix
      ?.replaceAll(new RegExp('[-_]', 'g'), ' ') // Replace - and _ with space
      ?.replaceAll(new RegExp('chat -*', 'g'), '') // Replace cgguf with gguf
      ?.replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  // General model name format: <provider>/<model-name>
  return modelName
    .split('/')
    .pop()
    ?.replaceAll(new RegExp('(-?)(gguf|GGUF|Gguf)$', 'g'), '') // Remove -gguf suffix
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
  }, [workspace]);

  // If the model name is not set and the workspace is remote, we don't want to show the model chip
  // since it will show "No model loaded" which is confusing
  if (!modelName && workspace?.isRemote) return null;
  return (
    <Fragment>
      <TouchableOpacity
        onPress={() => {
          if (LLMProvider?.isExternalProvider) return showToast('Please manage your model preferences in the settings page.');
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
        <AvailableModels bottomSheetRef={bottomSheetRef} />
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
  const searchInputRef = useRef(null);

  const {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    uninstallModel,
    selectModel,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  useEffect(() => {
    const fetchModels = async () => {
      // External providers (LM Studio, Ollama, OpenAI-compatible, ...) manage
      // their models from the settings screen, not this on-device model sheet.
      if (LLMProvider && !LLMProvider.isExternalProvider) {
        const models = await LLMProvider.availableModels() as AvailableModel[];
        setAvailableModels(models);
      } else setAvailableModels([]);
    };
    fetchModels();
  }, [LLMProvider]);

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
        <Text className="text-white text-sm text-center pt-4">
          No models found for "{searchQuery}"
        </Text>
      )}
      {filteredModels.length > 0 && (
        <FlatList
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