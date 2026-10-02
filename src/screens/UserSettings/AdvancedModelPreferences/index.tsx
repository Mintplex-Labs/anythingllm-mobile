import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IWorkspacePageKey } from '../index';
import useLLMPreference from '@/hooks/useLLMPreference';
import ProviderSelection from '@/components/LLMSelection/ProviderSelection';


import Telemetry from '@/utils/Telemetry';
import { findProviderDefinition, type ProviderConfig } from '@/utils/llmproviders';
import useProviderConfigCache from '@/hooks/useProviderConfigCache';
import useProviderSwitcher from '@/hooks/useProviderSwitcher';
import { peekPendingHfPull } from '@/utils/DeepLinks';

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    llmPreferences,
    LLMProvider,
    fetchLLMPreference,
    updateLLMPreference,
  } = useLLMPreference();
  const configCache = useProviderConfigCache();
  const {
    configuredProviders: cachedProviderKeys,
    refreshConfiguredProviders: refreshCachedKeys,
    switchProvider: handleProviderSelection,
  } = useProviderSwitcher();

  async function updateProviderSettings(provider: string, settings: ProviderConfig) {
    const merged = { ...llmPreferences.config, ...settings };
    await updateLLMPreference(provider, merged);
    await fetchLLMPreference();
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model: settings?.model ?? '' });
    await configCache.save(provider, merged);
    await refreshCachedKeys();
  }

  // An anythingllm://pull-hf link (Hugging Face "Use this model") brought us here: the model has to run
  // on-device, so move to that provider first. NativeOptions then consumes the pending pull and opens
  // the picker on the requested repo once it mounts.
  useEffect(() => {
    if (!peekPendingHfPull()) return;
    if (llmPreferences.provider !== 'native') handleProviderSelection('native');
  }, []);

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
            account={llmPreferences.config.account || ''}
            onApiKeyChange={updateProviderSettings}
            onBaseUrlChange={updateProviderSettings}
            onRegionChange={updateProviderSettings}
            onModelChange={updateProviderSettings}
            onAccountChange={updateProviderSettings}
          />
        );
      }
    }
  };

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col flex-1"
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
          {t('settings.advanced_model_preferences.title')}
        </Text>
      </View>

      {/* Provider Selection */}
      <View style={{ gap: 16, marginBottom: 31 }} className="flex flex-col">
        <Text className="text-white font-semibold text-lg">
          {t('settings.advanced_model_preferences.choose_provider')}
        </Text>
        <ProviderSelection
          selection={{
            provider: llmPreferences.provider,
            config: llmPreferences.config,
          }}
          onChange={provider => handleProviderSelection(provider)}
          cachedProviders={cachedProviderKeys}
        />
      </View>

      <View style={{ gap: 16 }} className="flex flex-col flex-1">
        <Text className="text-white font-semibold text-lg">
          {llmPreferences.provider === 'native' ? t('settings.advanced_model_preferences.llm_model') : t('settings.advanced_model_preferences.provider_settings')}
        </Text>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 8,
            paddingBottom: insets.bottom + 20,
            gap: 16,
          }}
          showsVerticalScrollIndicator={true}
        >
          {renderProviderOptions()}
        </ScrollView>
      </View>
    </SafeView>
  );
}
