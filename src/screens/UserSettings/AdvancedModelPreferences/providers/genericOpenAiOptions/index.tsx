import { View, Text, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useState } from 'react';
import { screenDimensions } from '@/utils/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardHeight from '@/hooks/useKeyboardHeight';

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
  onApiKeyChange: (provider: string, settings: { apiKey?: string, baseUrl?: string, model?: string }) => Promise<void>;
  onBaseUrlChange: (provider: string, settings: { apiKey?: string, baseUrl?: string, model?: string }) => Promise<void>;
  onModelChange: (provider: string, settings: { apiKey?: string, baseUrl?: string, model?: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [currentApiKey, setCurrentApiKey] = useState(apiKey || '');
  const [currentBaseUrl, setCurrentBaseUrl] = useState(baseUrl || '');
  const [currentModel, setCurrentModel] = useState(model || '');

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
          <TextInput
            key="model"
            keyboardType="default"
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
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
