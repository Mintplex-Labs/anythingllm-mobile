import { View, Text, TextInput } from 'react-native';
import { useState } from 'react';
import useLLMPreference from '@/hooks/useLLMPreference';

export default function OpenAiOptions() {
  const { llmPreferences, updateLLMPreference } = useLLMPreference();
  const [apiKey, setApiKey] = useState(llmPreferences.config.apiKey || '');

  const handleApiKeyChange = async (key: string) => {
    setApiKey(key);
    await updateLLMPreference('openai', {
      ...llmPreferences.config,
      apiKey: key,
      modelId: 'gpt-3.5-turbo',
    });
  };

  return (
    <View className="flex flex-col gap-y-4">
      <Text className="text-[#9F9FA0] text-sm font-semibold">
        OpenAI Configuration*
      </Text>
      <View
        style={{ backgroundColor: '#27282A' }}
        className="flex-col gap-y-4 px-4 py-[14px] rounded-lg">
        <View>
          <Text className="text-white text-sm mb-2">API Key</Text>
          <TextInput
            value={apiKey}
            onChangeText={handleApiKeyChange}
            placeholder="Enter your API key"
            placeholderTextColor="#9F9FA0"
            className="text-white text-sm bg-[#1B1B1E] px-4 py-2 rounded-lg"
            secureTextEntry
          />
        </View>
      </View>
    </View>
  );
}
