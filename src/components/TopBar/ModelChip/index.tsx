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
import { LLMProvider as LLMProviderType } from '@/utils/AiProviders';
import { defaultModels } from '@/utils/models';
import { Model } from '@/utils/types';

function getPresetModelName(llmPreferences: { provider: string; config: any }, LLMProvider: LLMProviderType | null) {
  if (llmPreferences.provider !== 'native') return llmPreferences.config.model;
  const modelDefinition = defaultModels.find(model => model.id === llmPreferences.config.model) as Model;
  return modelDefinition?.name || llmPreferences.config.model;
}

export default function ModelChip() {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const { llmPreferences, LLMProvider } = useLlmPreference();
  const modelName = getPresetModelName(llmPreferences, LLMProvider);

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




    console.log({ modelName });
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

  return (
    <Fragment>
      <TouchableOpacity
        onPress={() => presentSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}
        style={{ marginTop: -5, maxWidth: 200 }}
        className={`rounded-full ${!modelName ? 'bg-red-500/20' : 'bg-white/10'
          }`}>
        <Text
          style={{ fontSize: 14, paddingVertical: 4, paddingHorizontal: 12 }}
          className={`${!modelName ? 'text-red-500' : 'text-white'}`}
          numberOfLines={1}
          ellipsizeMode="middle">
          {parsedModelName || 'No model loaded'}
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
        enablePanDownToClose={true}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}>
        <AvailableModels bottomSheetRef={bottomSheetRef} />
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
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  useEffect(() => {
    if (LLMProvider) {
      const models = LLMProvider.availableModels() as AvailableModel[];
      setAvailableModels(models);
    } else setAvailableModels([]);
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
                  onSelect={() => downloadModel(item)}
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
