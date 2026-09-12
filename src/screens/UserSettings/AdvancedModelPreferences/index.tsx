import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { IWorkspacePageKey } from '../index';
import useLLMPreference from '@/hooks/useLLMPreference';
import ProviderSelection from '@/components/LLMSelection/ProviderSelection';
import { screenDimensions } from '@/utils/constants';
import Telemetry from '@/utils/Telemetry';
import { findProviderDefinition, type ProviderConfig } from '@/utils/llmproviders';
import useProviderConfigCache from '@/hooks/useProviderConfigCache';

import NativeOptions from './providers/nativeOptions';
import LMStudioOptions from './providers/LMStudioOptions';
import GenericOpenAiOptions from './providers/genericOpenAiOptions';
import OllamaOptions from './providers/OllamaOptions';

interface AdvancedModelPreferencesProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

export default function AdvancedModelPreferences({
  goToPage,
}: AdvancedModelPreferencesProps) {
  const insets = useSafeAreaInsets();
  const {
    llmPreferences,
    LLMProvider,
    fetchLLMPreference,
    updateLLMPreference,
  } = useLLMPreference();
  const configCache = useProviderConfigCache();
  const [cachedProviderKeys, setCachedProviderKeys] = useState<string[]>([]);

  useEffect(() => {
    configCache.cachedProviders().then(setCachedProviderKeys);
  }, []);

  async function refreshCachedKeys() {
    setCachedProviderKeys(await configCache.cachedProviders());
  }

  async function updateProviderSettings(provider: string, settings: ProviderConfig) {
    const merged = { ...llmPreferences.config, ...settings };
    await updateLLMPreference(provider, merged);
    await fetchLLMPreference();
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model: settings?.model ?? '' });
    await configCache.save(provider, merged);
    await refreshCachedKeys();
  }

  async function handleProviderSelection(provider: string) {
    await configCache.save(llmPreferences.provider, llmPreferences.config);
    await refreshCachedKeys();

    if (provider === 'native') {
      await updateLLMPreference('native', { model: llmPreferences.config.model });
      return;
    }

    const definition = findProviderDefinition(provider);
    const cached = await configCache.restore(provider);
    await updateLLMPreference(provider, cached ?? { ...(definition?.defaultConfig ?? {}) });
  }

  const renderProviderOptions = () => {
    switch (llmPreferences.provider) {
      case 'ollama':
        return <OllamaOptions
          provider="ollama"
          baseUrl={llmPreferences.config.baseUrl || ''}
          model={llmPreferences.config.model || ''}
          onBaseUrlChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      case 'lmstudio':
        return <LMStudioOptions
          provider="lmstudio"
          baseUrl={llmPreferences.config.baseUrl || ''}
          model={llmPreferences.config.model || ''}
          onBaseUrlChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      case 'native':
        return (
          <NativeOptions
            llmPreferences={llmPreferences}
            fetchLLMPreference={fetchLLMPreference}
            LLMProvider={LLMProvider}
          />
        );
      default: {
        // Every other external provider (OpenAI, Anthropic, Gemini, OpenRouter, Bedrock, ...)
        // shares the generic form - the fields shown come from the provider definition.
        if (!findProviderDefinition(llmPreferences.provider)) {
          return (
            <NativeOptions
              llmPreferences={llmPreferences}
              fetchLLMPreference={fetchLLMPreference}
              LLMProvider={LLMProvider}
            />
          );
        }
        return (
          <GenericOpenAiOptions
            key={llmPreferences.provider}
            provider={llmPreferences.provider}
            apiKey={llmPreferences.config.apiKey || ''}
            baseUrl={llmPreferences.config.baseUrl || ''}
            region={llmPreferences.config.region || ''}
            model={llmPreferences.config.model || ''}
            onApiKeyChange={updateProviderSettings}
            onBaseUrlChange={updateProviderSettings}
            onRegionChange={updateProviderSettings}
            onModelChange={updateProviderSettings}
          />
        );
      }
    }
  };

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={() => goToPage('main')}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">
          Model Selection
        </Text>
      </View>

      {/* Provider Selection */}
      <View style={{ gap: 16, marginBottom: 31 }} className="flex flex-col">
        <Text className="text-white font-semibold text-lg">
          Choose an LLM Provider
        </Text>
        <ProviderSelection
          selection={{
            provider: llmPreferences.provider,
            config: llmPreferences.config,
          }}
          onChange={handleProviderSelection}
          cachedProviders={cachedProviderKeys}
        />
      </View>

      <View style={{ gap: 16 }} className="flex flex-col">
        <Text className="text-white font-semibold text-lg">
          {llmPreferences.provider === 'native' ? 'LLM Model' : 'Provider Settings'}
        </Text>
        <View style={{ height: screenDimensions.height - insets.bottom - 300 }}>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 8,
              paddingBottom: 100,
              gap: 16,
            }}
            showsVerticalScrollIndicator={true}
          >
            {renderProviderOptions()}
          </ScrollView>
        </View>
      </View>
    </SafeView>
  );
}
