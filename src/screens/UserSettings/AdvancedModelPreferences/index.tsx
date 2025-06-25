import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import { ArrowLeft } from 'phosphor-react-native';
import { IWorkspacePageKey } from '../index';
import useLLMPreference from '@/hooks/useLLMPreference';
import { useState } from 'react';
import ProviderSelection from '@/components/LLMSelection/ProviderSelection';
import OpenAiOptions from './providers/openAiOptions';
import GenericOpenAiOptions from './providers/genericOpenAiOptions';
import NativeOptions from './providers/nativeOptions';

interface AdvancedModelPreferencesProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

export function AdvancedModelPreferences({
  goToPage,
}: AdvancedModelPreferencesProps) {
  const insets = useSafeAreaInsets();
  const {
    llmPreferences,
    LLMProvider,
    isLoading,
    fetchLLMPreference,
    updateLLMPreference,
  } = useLLMPreference();
  const [openAIKey, setOpenAIKey] = useState(
    llmPreferences.config.apiKey || '',
  );

  async function handleProviderSelection(provider: string) {
    switch (provider) {
      case 'openai':
        await updateLLMPreference('openai', {
          apiKey: openAIKey,
          modelId: 'gpt-3.5-turbo',
        });
        break;
      case 'generic-openai':
        await updateLLMPreference('generic-openai', {
          apiKey: openAIKey,
          baseUrl: llmPreferences.config.baseUrl || '',
          model: llmPreferences.config.model || '',
        });
        break;
      default:
        await updateLLMPreference('native', {
          model: llmPreferences.config.model,
        });
    }
  }

  function goBack() {
    goToPage('main');
  }

  const renderProviderOptions = () => {
    switch (llmPreferences.provider) {
      case 'openai':
        return (
          <OpenAiOptions apiKey={openAIKey} onApiKeyChange={setOpenAIKey} />
        );
      case 'generic-openai':
        return (
          <GenericOpenAiOptions
            baseUrl={llmPreferences.config.baseUrl || ''}
            apiKey={openAIKey}
            modelName={llmPreferences.config.model || ''}
            onBaseUrlChange={url => {
              updateLLMPreference('generic-openai', {
                ...llmPreferences.config,
                baseUrl: url,
              });
            }}
            onApiKeyChange={setOpenAIKey}
            onModelNameChange={name => {
              updateLLMPreference('generic-openai', {
                ...llmPreferences.config,
                model: name,
              });
            }}
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

  if (isLoading) return <ActivityIndicator size="large" color="white" />;

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 30,
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={goBack}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text
          style={{ maxWidth: '80%' }}
          numberOfLines={1}
          ellipsizeMode="middle"
          className="text-white text-lg font-medium">
          Model Selection
        </Text>
      </View>

      <View className="flex-1 flex flex-col">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 8,
            paddingBottom: 100,
          }}>
          <View className="flex-1">
            {/* Provider Selection */}
            <View className="mb-8">
              <Text className="text-[#9F9FA0] text-sm font-semibold mb-4">
                Choose an LLM Provider*
              </Text>
              <ProviderSelection
                selection={{
                  provider: llmPreferences.provider,
                  config: llmPreferences.config,
                }}
                onChange={handleProviderSelection}
              />
            </View>

            {/* Model Selection */}
            {renderProviderOptions()}
          </View>
        </ScrollView>
      </View>
    </SafeView>
  );
}
