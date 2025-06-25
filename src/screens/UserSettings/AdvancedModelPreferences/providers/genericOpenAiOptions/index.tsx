import { View, Text, TextInput } from 'react-native';
import { useState } from 'react';
import useLLMPreference from '@/hooks/useLLMPreference';

export default function GenericOpenAiOptions() {
  const { llmPreferences, updateLLMPreference } = useLLMPreference();
  const [apiKey, setApiKey] = useState(llmPreferences.config.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(llmPreferences.config.baseUrl || '');
  const [modelName, setModelName] = useState(llmPreferences.config.model || '');

  const updateConfig = async (
    updates: Partial<typeof llmPreferences.config>,
  ) => {
    await updateLLMPreference('generic-openai', {
      ...llmPreferences.config,
      ...updates,
    });
  };

  return (
    <View className="flex flex-col gap-y-4">
      <Text className="text-[#9F9FA0] text-sm font-semibold">
        Generic OpenAI Configuration*
      </Text>
      <View
        style={{ backgroundColor: '#27282A' }}
        className="flex-col gap-y-4 px-4 py-[14px] rounded-lg">
        <View>
          <Text className="text-white text-sm mb-2">Base URL</Text>
          <TextInput
            value={baseUrl}
            onChangeText={url => {
              setBaseUrl(url);
              updateConfig({ baseUrl: url });
            }}
            placeholder="e.g: https://proxy.openai.com"
            placeholderTextColor="#9F9FA0"
            className="text-white text-sm bg-[#1B1B1E] px-4 py-2 rounded-lg"
          />
        </View>
        <View>
          <Text className="text-white text-sm mb-2">API Key</Text>
          <TextInput
            value={apiKey}
            onChangeText={key => {
              setApiKey(key);
              updateConfig({ apiKey: key });
            }}
            placeholder="Enter your API key"
            placeholderTextColor="#9F9FA0"
            className="text-white text-sm bg-[#1B1B1E] px-4 py-2 rounded-lg"
            secureTextEntry
          />
        </View>
        <View>
          <Text className="text-white text-sm mb-2">Model Name</Text>
          <TextInput
            value={modelName}
            onChangeText={name => {
              setModelName(name);
              updateConfig({ model: name });
            }}
            placeholder="Model id used for chat requests"
            placeholderTextColor="#9F9FA0"
            className="text-white text-sm bg-[#1B1B1E] px-4 py-2 rounded-lg"
          />
        </View>
      </View>
    </View>
  );
}
