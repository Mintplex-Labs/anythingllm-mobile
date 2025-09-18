import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import { ArrowLeft } from 'phosphor-react-native';
import { IWorkspacePageKey } from '../index';
import useLLMPreference from '@/hooks/useLLMPreference';
import ProviderSelection from '@/components/LLMSelection/ProviderSelection';
import { screenDimensions } from '@/utils/constants';
import Telemetry from '@/utils/Telemetry';

import NativeOptions from './providers/nativeOptions';
import LMStudioOptions from './providers/LMStudioOptions';
import GenericOpenAiOptions from './providers/genericOpenAiOptions';
import OllamaOptions from './providers/OllamaOptions';
import OpenRouterOptions from './providers/OpenRouterOptions';

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
  async function updateProviderSettings(provider: string, settings: { apiKey?: string, baseUrl?: string, model?: string }) {
    await updateLLMPreference(provider, {
      ...llmPreferences.config,
      ...settings,
    });
    await fetchLLMPreference();
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model: settings?.model ?? '' });
  }

  async function handleProviderSelection(provider: string) {
    switch (provider) {
      case 'openai':
        await updateLLMPreference('openai', {
          apiKey: llmPreferences.config.apiKey,
          modelId: 'gpt-3.5-turbo',
          baseUrl: 'https://api.openai.com/v1',
        });
        break;
      case 'openrouter':
        await updateLLMPreference('openrouter', {
          apiKey: llmPreferences.config.apiKey,
          modelId: 'qwen/qwen3-4b:free'
        });
        break;
      case 'lmstudio':
        await updateLLMPreference('lmstudio', {
          baseUrl: '',
          modelId: ''
        });
        break;
      case 'ollama':
        await updateLLMPreference('ollama', {
          baseUrl: '',
          model: '',
        });
        break;
      case 'generic-openai':
        await updateLLMPreference('generic-openai', {
          apiKey: '',
          baseUrl: '',
          model: '',
        });
        break;
      default:
        await updateLLMPreference('native', {
          model: llmPreferences.config.model,
        });
    }
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
      case 'openai':
        return <GenericOpenAiOptions
          provider={llmPreferences.provider}
          apiKey={llmPreferences.config.apiKey || ''}
          baseUrl={llmPreferences.config.baseUrl || ''}
          model={llmPreferences.config.model || ''}
          onApiKeyChange={updateProviderSettings}
          onBaseUrlChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      case 'openrouter':
        return <OpenRouterOptions
          provider="openrouter"
          apiKey={llmPreferences.config.apiKey || ''}
          model={llmPreferences.config.model || ''}
          onApiKeyChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      case 'generic-openai':
        return (
          <GenericOpenAiOptions
            provider="generic-openai"
            apiKey={llmPreferences.config.apiKey || ''}
            baseUrl={llmPreferences.config.baseUrl || ''}
            model={llmPreferences.config.model || ''}
            onApiKeyChange={updateProviderSettings}
            onBaseUrlChange={updateProviderSettings}
            onModelChange={updateProviderSettings}
          />
        );
      case 'native':
      default:
        return (
          <NativeOptions
            llmPreferences={llmPreferences}
            fetchLLMPreference={fetchLLMPreference}
            LLMProvider={LLMProvider}
          />
        );
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
