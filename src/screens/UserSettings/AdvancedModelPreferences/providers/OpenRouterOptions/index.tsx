import { View, Text, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { screenDimensions } from '@/utils/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardHeight from '@/hooks/useKeyboardHeight';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { X, MagnifyingGlass, CaretDown } from 'phosphor-react-native';
import getLLM from '@/utils/AiProviders';
import OpenAICompatible, { OpenAICompatibleModel } from '@/utils/AiProviders/openAICompatible';
import debounce from 'lodash/debounce';

export default function OpenRouterOptions({
  provider,
  apiKey,
  model,
  onApiKeyChange,
  onModelChange,
}: {
  provider: 'openrouter';
  apiKey: string;
  model: string;
  onApiKeyChange?: (provider: string, settings: { apiKey?: string }) => Promise<void>;
  onModelChange?: (provider: string, settings: { model?: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [currentApiKey, setCurrentApiKey] = useState(apiKey || '');
  const [currentModelId, setCurrentModelId] = useState(model || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableModels, setAvailableModels] = useState<OpenAICompatibleModel[]>([]);
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const handlePropertyChange = async (key: string, value: string) => {
    switch (key) {
      case 'apiKey':
        setCurrentApiKey(value);
        await onApiKeyChange?.(provider, { apiKey: value });
        break;
      case 'model':
        setCurrentModelId(value);
        await onModelChange?.(provider, { model: value });
        break;
    }
  };

  const filteredModels = useMemo(() => {
    return availableModels.filter(model => model.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, availableModels]);

  const handleModelSelect = (modelId: string) => {
    handlePropertyChange('model', modelId);
    bottomSheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );

  const debouncedFetchModels = useRef(
    debounce(async (apiKey: string) => {
      if (apiKey) {
        try {
          const models = await (getLLM('openrouter', { apiKey }) as OpenAICompatible).availableModels();
          setAvailableModels(models.map((model: OpenAICompatibleModel) => model));
          setCurrentModelId(models[0]?.id || '');
        } catch (error) {
          console.log(`Error fetching models:`, error);
          setAvailableModels([]);
          setCurrentModelId('');
        }
      } else {
        setAvailableModels([]);
        setCurrentModelId('');
      }
    }, 500)
  ).current;

  const debouncedSaveApiKey = useRef(
    debounce(async (apiKey: string) => {
      await onApiKeyChange?.(provider, { apiKey: apiKey });
    }, 500)
  ).current;

  useEffect(() => {
    debouncedFetchModels(currentApiKey);
  }, [currentApiKey, debouncedFetchModels]);

  useEffect(() => {
    return () => {
      debouncedFetchModels.cancel();
      debouncedSaveApiKey.cancel();
    };
  }, [debouncedFetchModels, debouncedSaveApiKey]);

  return (
    <View className="flex flex-col">
      <KeyboardAvoidingView style={{ gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 flex flex-col">
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <View className="flex flex-row items-center justify-between">
            <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">API Key</Text>
          </View>
          <TextInput
            multiline={false}
            numberOfLines={1}
            style={{
              maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
              backgroundColor: '#000',
              textAlignVertical: 'center',
              padding: 16
            }}
            className="rounded-lg text-white placeholder:text-white/50 text-left"
            value={currentApiKey}
            onChangeText={value => setCurrentApiKey(value)}
            onBlur={() => onApiKeyChange?.(provider, { apiKey: currentApiKey })}
            placeholder="Enter your API key"
          />
        </View>

        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <View className="flex flex-row items-center justify-between">
            <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">Model Selection</Text>
          </View>
          <TouchableOpacity
            onPress={() => bottomSheetRef.current?.present()}
            style={{
              backgroundColor: '#000',
              padding: 16,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: currentModelId ? 'white' : '#9F9FA0', fontSize: 16 }}>
                {currentModelId ? currentModelId : 'Select a model'}
              </Text>
            </View>
            <CaretDown size={20} color="#9F9FA0" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={['60%', '95%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#1B1B1E' }}
        handleIndicatorStyle={{
          backgroundColor: '#9F9FA0',
          width: 45,
          margin: 10,
        }}>
        <BottomSheetScrollView className="flex-1 bg-[#1B1B1E]">
          <Text className="text-white text-lg font-semibold py-4 text-center">
            Choose your model
          </Text>
          <View className="flex flex-row items-center mx-4 bg-[#27282A] rounded-lg px-4 mb-4">
            <MagnifyingGlass size={20} weight="bold" color="white" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search models"
              placeholderTextColor="#9F9FA0"
              className="flex-1 h-[38px] ml-2 text-white"
              scrollEnabled={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-1 px-4" style={{ marginBottom: insets.bottom }}>
            {filteredModels.map((model: OpenAICompatibleModel) => (
              <TouchableOpacity
                key={model.id}
                onPress={() => handleModelSelect(model.id)}
                style={{
                  backgroundColor: currentModelId === model.id ? '#2e404b' : 'transparent',
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: currentModelId === model.id ? '#7cd4fd' : '#27282A'
                }}>
                <Text style={{
                  color: currentModelId === model.id ? 'white' : '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '600'
                }}>
                  {model.id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}
