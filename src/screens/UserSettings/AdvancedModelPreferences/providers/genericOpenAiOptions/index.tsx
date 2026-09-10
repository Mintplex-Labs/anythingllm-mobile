import { View, Text, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { screenDimensions } from '@/utils/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardHeight from '@/hooks/useKeyboardHeight';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { X, MagnifyingGlass, CaretDown } from 'phosphor-react-native';
import getLLM from '@/utils/AiProviders';
import OpenAICompatible, { OpenAICompatibleModel } from '@/utils/AiProviders/openAICompatible';
import debounce from 'lodash/debounce';

type ProviderSettings = { apiKey?: string, baseUrl?: string, model?: string };

/**
 * Base URLs to try when discovering models. Many OpenAI-compatible servers
 * (LM Studio, vLLM, llama.cpp, ...) mount their routes under /v1, and users
 * frequently omit it, so we retry with /v1 appended when the URL lacks it.
 */
function baseUrlCandidates(baseUrl: string, requiresBaseUrl: boolean): string[] {
  if (!requiresBaseUrl) return [baseUrl];
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/v\d+$/i.test(trimmed)) return [trimmed];
  return [trimmed, `${trimmed}/v1`];
}

export default function GenericOpenAiOptions({
  provider,
  apiKey,
  baseUrl,
  model,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
}: {
  provider: 'openai' | 'generic-openai';
  apiKey: string;
  baseUrl: string;
  model: string;
  onApiKeyChange: (provider: string, settings: ProviderSettings) => Promise<void>;
  onBaseUrlChange: (provider: string, settings: ProviderSettings) => Promise<void>;
  onModelChange: (provider: string, settings: ProviderSettings) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [currentApiKey, setCurrentApiKey] = useState(apiKey || '');
  const [currentBaseUrl, setCurrentBaseUrl] = useState(baseUrl || '');
  const [currentModel, setCurrentModel] = useState(model || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableModels, setAvailableModels] = useState<OpenAICompatibleModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const fetchRequestId = useRef(0);

  const filteredModels = useMemo(() => {
    return availableModels.filter(m => m.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, availableModels]);

  const handleModelSelect = async (modelId: string) => {
    setCurrentModel(modelId);
    bottomSheetRef.current?.dismiss();
    await onModelChange?.(provider, { model: modelId });
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

  /**
   * Attempt to discover the models available at the endpoint.
   * Any failure (network, auth, non-OpenAI shaped response) resolves to an
   * empty list, which makes the UI fall back to a plain text model input.
   */
  const debouncedFetchModels = useRef(
    debounce(async ({ baseUrl, apiKey }: { baseUrl: string, apiKey: string }) => {
      const requestId = ++fetchRequestId.current;
      const requiresBaseUrl = provider !== 'openai';
      if (requiresBaseUrl && !baseUrl) {
        setAvailableModels([]);
        setHasAttemptedFetch(false);
        setIsFetchingModels(false);
        return;
      }

      setIsFetchingModels(true);
      let models: OpenAICompatibleModel[] = [];
      let resolvedBaseUrl = baseUrl;
      for (const candidateUrl of baseUrlCandidates(baseUrl, requiresBaseUrl)) {
        try {
          const llm = getLLM(provider, { baseUrl: candidateUrl, apiKey }) as OpenAICompatible;
          const result = await llm.availableModels();
          models = Array.isArray(result) ? result.filter((m) => !!m?.id) : [];
        } catch (error) {
          console.log(`Error fetching models: (${candidateUrl})`, error);
          models = [];
        }
        if (requestId !== fetchRequestId.current) return; // stale - user kept typing
        if (models.length > 0) {
          resolvedBaseUrl = candidateUrl;
          break;
        }
      }

      setAvailableModels(models);
      setHasAttemptedFetch(true);
      setIsFetchingModels(false);

      // The endpoint only answered once we appended /v1 - persist the corrected
      // base URL so chat requests hit the same working path.
      if (models.length > 0 && resolvedBaseUrl !== baseUrl) {
        setCurrentBaseUrl(resolvedBaseUrl);
        await onBaseUrlChange?.(provider, { baseUrl: resolvedBaseUrl });
      }
    }, 500)
  ).current;

  useEffect(() => {
    debouncedFetchModels({ baseUrl: currentBaseUrl, apiKey: currentApiKey });
  }, [currentBaseUrl, currentApiKey, debouncedFetchModels]);

  useEffect(() => {
    return () => {
      debouncedFetchModels.cancel();
    };
  }, [debouncedFetchModels]);

  const hasDiscoveredModels = availableModels.length > 0;
  const showFallbackHint = hasAttemptedFetch && !isFetchingModels && !hasDiscoveredModels;

  return (
    <View className="flex flex-col">
      <KeyboardAvoidingView style={{ gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 flex flex-col">

        {provider !== 'openai' && (
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">Base URL</Text>
            </View>
            <TextInput
              key="baseUrl"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              multiline={false}
              numberOfLines={1}
              style={{
                maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                backgroundColor: '#000',
                textAlignVertical: 'center',
                padding: 16
              }}
              className="rounded-lg text-white placeholder:text-white/50 text-left"
              value={currentBaseUrl}
              onChangeText={(value) => setCurrentBaseUrl(value.toLowerCase().trim())}
              onBlur={() => onBaseUrlChange?.(provider, { baseUrl: currentBaseUrl })}
              placeholder="Enter your base URL (e.g. https://api.openai.com/v1/)"
            />
          </View>
        )}

        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <View className="flex flex-row items-center justify-between">
            <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">API Key</Text>
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
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
            {isFetchingModels && (
              <View className="flex flex-row items-center" style={{ gap: 6 }}>
                <ActivityIndicator size="small" color="#9F9FA0" />
                <Text style={{ color: '#9F9FA0' }} className="text-sm">Fetching models...</Text>
              </View>
            )}
          </View>

          {hasDiscoveredModels ? (
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
                <Text style={{ color: currentModel ? 'white' : '#9F9FA0', fontSize: 16 }}>
                  {currentModel ? currentModel : 'Select a model'}
                </Text>
              </View>
              <CaretDown size={20} color="#9F9FA0" />
            </TouchableOpacity>
          ) : (
            <TextInput
              key="model"
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              multiline={false}
              numberOfLines={1}
              style={{
                maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                backgroundColor: '#000',
                textAlignVertical: 'center',
                padding: 16
              }}
              className="rounded-lg text-white placeholder:text-white/50 text-left"
              value={currentModel}
              onChangeText={value => setCurrentModel(value)}
              onBlur={() => onModelChange?.(provider, { model: currentModel })}
              placeholder="Enter your model (e.g. gpt-3.5-turbo)"
            />
          )}

          {showFallbackHint && (
            <Text style={{ color: '#9F9FA0' }} className="text-sm">
              Could not load models from this endpoint. Enter the model name manually.
            </Text>
          )}
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
            {filteredModels.map((m: OpenAICompatibleModel) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => handleModelSelect(m.id)}
                style={{
                  backgroundColor: currentModel === m.id ? '#2e404b' : 'transparent',
                  padding: 16,
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: currentModel === m.id ? '#7cd4fd' : '#27282A'
                }}>
                <Text style={{
                  color: 'white',
                  fontSize: 16,
                  fontWeight: '600'
                }}>
                  {m.id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
}
