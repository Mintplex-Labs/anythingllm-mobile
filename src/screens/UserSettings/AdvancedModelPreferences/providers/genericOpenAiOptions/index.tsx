import { View, Text, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { screenDimensions } from '@/utils/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardHeight from '@/hooks/useKeyboardHeight';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { X, MagnifyingGlass, CaretDown } from 'phosphor-react-native';
import getLLM from '@/utils/AiProviders';
import { IAvailableModel } from '@/utils/AiProviders/baseOpenAILikeProvider';
import { findProviderDefinition, type ProviderConfig } from '@/utils/llmproviders';
import { BEDROCK_REGIONS } from '@/utils/AiProviders/BedrockProvider';
import debounce from 'lodash/debounce';

type ProviderSettings = ProviderConfig;

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

const inputStyle = (maxHeight: number) => ({
  maxHeight,
  backgroundColor: '#000',
  textAlignVertical: 'center' as const,
  padding: 16,
});

/**
 * Connection form shared by every external provider that speaks an OpenAI-shaped API
 * (OpenAI, Anthropic, Gemini, OpenRouter, Bedrock, DeepSeek, ... and self-hosted servers).
 * Which inputs are shown (API key, base URL, AWS region) comes from the provider's
 * `fields` in `AVAILABLE_LLM_PROVIDERS`; the model is discovered from the provider's
 * model listing and falls back to a manual text input when listing fails.
 */
export default function GenericOpenAiOptions({
  provider,
  apiKey,
  baseUrl,
  region,
  model,
  onApiKeyChange,
  onBaseUrlChange,
  onRegionChange,
  onModelChange,
}: {
  provider: string;
  apiKey: string;
  baseUrl: string;
  region?: string;
  model: string;
  onApiKeyChange: (provider: string, settings: ProviderSettings) => Promise<void>;
  onBaseUrlChange: (provider: string, settings: ProviderSettings) => Promise<void>;
  onRegionChange?: (provider: string, settings: ProviderSettings) => Promise<void>;
  onModelChange: (provider: string, settings: ProviderSettings) => Promise<void>;
}) {
  const definition = findProviderDefinition(provider);
  const showApiKey = definition ? definition.fields.apiKey !== false : true;
  const requiresApiKey = definition?.fields.apiKey === 'required';
  const requiresBaseUrl = definition ? definition.fields.baseUrl : provider !== 'openai';
  const showRegion = !!definition?.fields.region;

  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [currentApiKey, setCurrentApiKey] = useState(apiKey || '');
  const [currentBaseUrl, setCurrentBaseUrl] = useState(baseUrl || '');
  const [currentRegion, setCurrentRegion] = useState(region || definition?.defaultConfig.region || '');
  const [currentModel, setCurrentModel] = useState(model || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [regionQuery, setRegionQuery] = useState('');
  const [availableModels, setAvailableModels] = useState<IAvailableModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const regionSheetRef = useRef<BottomSheetModal>(null);
  const fetchRequestId = useRef(0);
  // Refs so the debounced fetch (created once) always sees the latest selection and handler.
  const currentModelRef = useRef(currentModel);
  const onModelChangeRef = useRef(onModelChange);
  currentModelRef.current = currentModel;
  onModelChangeRef.current = onModelChange;

  const maxInputHeight = screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200;

  const filteredModels = useMemo(() => {
    return availableModels.filter(m => m.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, availableModels]);

  const filteredRegions = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    return BEDROCK_REGIONS.filter(r => !q || r.code.includes(q) || r.name.toLowerCase().includes(q));
  }, [regionQuery]);

  const handleModelSelect = async (modelId: string) => {
    setCurrentModel(modelId);
    bottomSheetRef.current?.dismiss();
    await onModelChange?.(provider, { model: modelId });
  };

  const handleRegionSelect = async (code: string) => {
    const next = code.trim();
    if (!next) return;
    setCurrentRegion(next);
    setRegionQuery('');
    regionSheetRef.current?.dismiss();
    await onRegionChange?.(provider, { region: next });
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
    debounce(async ({ baseUrl, apiKey, region }: { baseUrl: string, apiKey: string, region: string }) => {
      const requestId = ++fetchRequestId.current;
      const missingBaseUrl = requiresBaseUrl && !baseUrl;
      const missingApiKey = requiresApiKey && !apiKey;
      const missingRegion = showRegion && !region;
      if (missingBaseUrl || missingApiKey || missingRegion) {
        setAvailableModels([]);
        setHasAttemptedFetch(false);
        setIsFetchingModels(false);
        return;
      }

      setIsFetchingModels(true);
      let models: IAvailableModel[] = [];
      let resolvedBaseUrl = baseUrl;
      for (const candidateUrl of baseUrlCandidates(baseUrl, requiresBaseUrl)) {
        try {
          const llm = getLLM(provider, { baseUrl: candidateUrl, apiKey, region }) as { availableModels: () => Promise<IAvailableModel[]> };
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

      // Nothing selected yet - default to the first discovered model and persist it so the
      // picker never shows a model that was not actually saved.
      const firstModelId = models[0]?.id;
      if (!currentModelRef.current && firstModelId) {
        setCurrentModel(firstModelId);
        await onModelChangeRef.current?.(provider, { model: firstModelId, baseUrl: resolvedBaseUrl, apiKey, ...(showRegion ? { region } : {}) });
      }
    }, 500)
  ).current;

  useEffect(() => {
    debouncedFetchModels({ baseUrl: currentBaseUrl, apiKey: currentApiKey, region: currentRegion });
  }, [currentBaseUrl, currentApiKey, currentRegion, debouncedFetchModels]);

  useEffect(() => {
    return () => {
      debouncedFetchModels.cancel();
    };
  }, [debouncedFetchModels]);

  const hasDiscoveredModels = availableModels.length > 0;
  const showFallbackHint = hasAttemptedFetch && !isFetchingModels && !hasDiscoveredModels;
  const selectedRegion = BEDROCK_REGIONS.find(r => r.code === currentRegion);

  return (
    <View className="flex flex-col">
      <KeyboardAvoidingView style={{ gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 flex flex-col">

        {requiresBaseUrl && (
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
              style={inputStyle(maxInputHeight)}
              className="rounded-lg text-white placeholder:text-white/50 text-left"
              value={currentBaseUrl}
              onChangeText={(value) => setCurrentBaseUrl(value.toLowerCase().trim())}
              onBlur={() => onBaseUrlChange?.(provider, { baseUrl: currentBaseUrl })}
              placeholder={`Enter your base URL (e.g. ${definition?.baseUrlPlaceholder ?? 'https://api.openai.com/v1/'})`}
            />
          </View>
        )}

        {showApiKey && (
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">
                API Key{!requiresApiKey ? ' (optional)' : ''}
              </Text>
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline={false}
              numberOfLines={1}
              style={inputStyle(maxInputHeight)}
              className="rounded-lg text-white placeholder:text-white/50 text-left"
              value={currentApiKey}
              onChangeText={value => setCurrentApiKey(value)}
              onBlur={() => onApiKeyChange?.(provider, { apiKey: currentApiKey })}
              placeholder="Enter your API key"
            />
          </View>
        )}

        {showRegion && (
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: '#9F9FA0' }} className="text-lg uppercase">AWS Region</Text>
            </View>
            <TouchableOpacity
              onPress={() => regionSheetRef.current?.present()}
              style={{
                backgroundColor: '#000',
                padding: 16,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: currentRegion ? 'white' : '#9F9FA0', fontSize: 16 }}>
                  {currentRegion
                    ? `${currentRegion}${selectedRegion ? ` - ${selectedRegion.name}` : ''}`
                    : 'Select a region'}
                </Text>
              </View>
              <CaretDown size={20} color="#9F9FA0" />
            </TouchableOpacity>
          </View>
        )}

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
              style={inputStyle(maxInputHeight)}
              className="rounded-lg text-white placeholder:text-white/50 text-left"
              value={currentModel}
              onChangeText={value => setCurrentModel(value)}
              onBlur={() => onModelChange?.(provider, { model: currentModel })}
              placeholder={`Enter your model (e.g. ${definition?.modelPlaceholder ?? 'gpt-4o'})`}
            />
          )}

          {showFallbackHint && (
            <Text style={{ color: '#9F9FA0' }} className="text-sm">
              Could not load models from this provider. Check your credentials or enter the model name manually.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Model picker */}
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
            {filteredModels.map((m: IAvailableModel) => (
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

      {/* AWS region picker (Bedrock only) */}
      {showRegion && (
        <BottomSheetModal
          ref={regionSheetRef}
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
              Choose your AWS region
            </Text>
            <View className="flex flex-row items-center mx-4 bg-[#27282A] rounded-lg px-4 mb-4">
              <MagnifyingGlass size={20} weight="bold" color="white" />
              <TextInput
                value={regionQuery}
                onChangeText={setRegionQuery}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Search or type a region code"
                placeholderTextColor="#9F9FA0"
                className="flex-1 h-[38px] ml-2 text-white"
                scrollEnabled={false}
              />
              {regionQuery.length > 0 && (
                <TouchableOpacity onPress={() => setRegionQuery('')}>
                  <X size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>

            <View className="flex-1 px-4" style={{ marginBottom: insets.bottom }}>
              {/* Regions we do not list (new launches, ISO partitions) can still be typed in. */}
              {regionQuery.trim().length > 0 && !BEDROCK_REGIONS.some(r => r.code === regionQuery.trim().toLowerCase()) && (
                <TouchableOpacity
                  onPress={() => handleRegionSelect(regionQuery.toLowerCase())}
                  style={{ padding: 16, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#7cd4fd' }}>
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                    Use "{regionQuery.trim().toLowerCase()}"
                  </Text>
                </TouchableOpacity>
              )}
              {filteredRegions.map((r) => (
                <TouchableOpacity
                  key={r.code}
                  onPress={() => handleRegionSelect(r.code)}
                  style={{
                    backgroundColor: currentRegion === r.code ? '#2e404b' : 'transparent',
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: currentRegion === r.code ? '#7cd4fd' : '#27282A'
                  }}>
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{r.code}</Text>
                  <Text style={{ color: '#9F9FA0', fontSize: 13 }}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BottomSheetScrollView>
        </BottomSheetModal>
      )}
    </View>
  );
}
