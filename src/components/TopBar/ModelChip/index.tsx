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
import { MagnifyingGlass, X } from 'phosphor-react-native';
import useLlmPreference from '@/hooks/useLLMPreference';
import useModelManager from '@/hooks/useModelManager';
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from '@/contexts/BottomSheetContext';
import ModelCard from '@/components/ModelCard';
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
          <ProviderIcon provider={llmPreferences.provider} />
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
  description?: string;
  isPreset?: boolean;
  imageUrl?: string;
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
      if (LLMProvider) {
        const models = await LLMProvider.availableModels() as AvailableModel[];
        setAvailableModels(models);
      } else setAvailableModels([]);
    };
    fetchModels();
  }, [LLMProvider]);

  const filteredModels = useMemo(() => {
    return availableModels.filter(
      model =>
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (model.description || '')
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  }, [availableModels, searchQuery]);

  if (isLoading) return <ActivityIndicator size="large" color="white" />;

  let seenAllPresets = 0;
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
          data={filteredModels}
          className="w-full"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 100,
            gap: 10,
          }}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          renderItem={({ item, index }) => {
            const isCurrentlySelected = selectedModel === item.modelId;
            const isDownloaded = downloadedModels[item.modelId];
            if (!item.isPreset) seenAllPresets++;

            return (
              <Fragment key={`${item.modelId}-${index}`}>
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
                  onSelect={() => {
                    if (llmPreferences.provider === 'native') return downloadModel(item);
                    else return selectModel({ modelId: item.id }); // Generic OpenAI /models results
                  }}
                  onUninstall={() => uninstallModel(item)}
                />
              </Fragment>
            );
          }}
        />
      )}
    </View>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'native') return null; // No icon for on-device.

  const supportedProviders: { [key: string]: any } = {};
  AVAILABLE_LLM_PROVIDERS.map(provider => supportedProviders[provider.value] = provider.logo);
  if (!(provider in supportedProviders)) return null;
  return <Image source={supportedProviders[provider]} style={{ width: 15, height: 15, marginRight: 4 }} />;
}