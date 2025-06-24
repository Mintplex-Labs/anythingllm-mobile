import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import uiStore from '@/store/UIStore';
import { showToast } from '@/utils/Notification';

export default function LLMManagerView() {
  const [llmpref, setLlmPref] = useState<{
    provider: string;
    config: { model: string };
  } | null>(null);

  useEffect(() => {
    uiStore
      .getFromStorage('llmPreference', {
        provider: 'openai',
        config: { model: 'gpt-4' },
      })
      .then(value => {
        setLlmPref(value);
      });
  }, []);

  return (
    <View className="bg-[--secondary-bg] rounded-xl p-4 mb-4">
      <Text className="text-white text-2xl font-bold mb-4">
        LLM Configuration
      </Text>
      <View className="flex flex-col gap-y-4">
        <View>
          <Text className="text-white font-medium mb-2">Provider</Text>
          <TextInput
            placeholder="e.g. openai"
            placeholderTextColor="#6c757d"
            className="p-4 rounded-lg bg-[--primary-bg] text-white border-none"
            value={llmpref?.provider}
            onChangeText={(text: string) =>
              setLlmPref(prev => (prev ? { ...prev, provider: text } : null))
            }
          />
        </View>

        <View>
          <Text className="text-white font-medium mb-2">Model</Text>
          <TextInput
            placeholder="e.g. gpt-4"
            placeholderTextColor="#6c757d"
            className="p-4 rounded-lg bg-[--primary-bg] text-white border-none"
            value={llmpref?.config?.model}
            onChangeText={(text: string) =>
              setLlmPref(prev =>
                prev
                  ? { ...prev, config: { ...prev.config, model: text } }
                  : null,
              )
            }
          />
        </View>

        <TouchableOpacity
          className="bg-[--cta-light-blue] rounded-lg p-4 mt-2"
          onPress={() => {
            if (llmpref) {
              uiStore.setToStorage('llmPreference', llmpref);
              showToast('LLM configuration saved');
            }
          }}>
          <Text className="text-[--dark] font-bold text-center">
            Save Configuration
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
