import { Alert, Text, TouchableOpacity, View, ScrollView } from "react-native";
import React, { useState } from "react";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import ProviderSelection from "@/components/LLMSelection/ProviderSelection";
import Telemetry from "@/utils/Telemetry";
import type { SelectionModeProps } from "../index";
import { findProviderDefinition, validateProviderConfig, type ProviderConfig } from "@/utils/llmproviders";

import LMStudioOptions from "@/screens/UserSettings/AdvancedModelPreferences/providers/LMStudioOptions";
import GenericOpenAiOptions from "@/screens/UserSettings/AdvancedModelPreferences/providers/genericOpenAiOptions";
import OllamaOptions from "@/screens/UserSettings/AdvancedModelPreferences/providers/OllamaOptions";

const DEFAULT_PROVIDER = 'ollama';

/**
 * Default (empty) config for an external provider when it is first selected.
 * Comes from `AVAILABLE_LLM_PROVIDERS` so onboarding and UserSettings > AdvancedModelPreferences agree.
 */
function defaultConfigFor(provider: string): ProviderConfig {
  return { ...(findProviderDefinition(provider)?.defaultConfig ?? {}) };
}

/**
 * Onboarding view that lets the user connect an external LLM provider instead of
 * downloading an on-device model. Nothing is persisted until the user taps Continue
 * so the on-device flow remains untouched if they go back.
 */
export default function ExternalProviderSelection({ setMode }: SelectionModeProps) {
  const navigation = useNavigation<NavigationProp<any>>();
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
  const [config, setConfig] = useState<ProviderConfig>(defaultConfigFor(DEFAULT_PROVIDER));
  const [saving, setSaving] = useState(false);

  const handleProviderSelection = (nextProvider: string) => {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setConfig(defaultConfigFor(nextProvider));
  };

  const updateProviderSettings = async (_provider: string, settings: ProviderConfig) => {
    setConfig(prev => ({ ...prev, ...settings }));
  };

  const validationError = validateProviderConfig(provider, config);

  const saveAndNavigate = async () => {
    if (validationError) return Alert.alert('Incomplete provider setup', validationError);
    setSaving(true);
    try {
      await uiStore.setToStorage('llmPreference', { provider, config });
      await uiStore.setToStorage('onboarding_model_selection_completed', true);
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model: config.model ?? '' });
      navigation.navigate(PATHS.onboarding.survey as never);
    } finally {
      setSaving(false);
    }
  };

  const renderProviderOptions = () => {
    switch (provider) {
      case 'ollama':
        return <OllamaOptions
          provider="ollama"
          baseUrl={config.baseUrl || ''}
          model={config.model || ''}
          onBaseUrlChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      case 'lmstudio':
        return <LMStudioOptions
          provider="lmstudio"
          baseUrl={config.baseUrl || ''}
          model={config.model || ''}
          onBaseUrlChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
      default:
        if (!findProviderDefinition(provider)) return null;
        // Every other external provider shares the generic form - see AVAILABLE_LLM_PROVIDERS `fields`.
        return <GenericOpenAiOptions
          provider={provider}
          apiKey={config.apiKey || ''}
          baseUrl={config.baseUrl || ''}
          region={config.region || ''}
          model={config.model || ''}
          onApiKeyChange={updateProviderSettings}
          onBaseUrlChange={updateProviderSettings}
          onRegionChange={updateProviderSettings}
          onModelChange={updateProviderSettings}
        />
    }
  };

  return (
    <View className="flex flex-col flex-1" style={{ gap: 24 }}>
      <View className="flex flex-col gap-y-4 justify-center items-center">
        <Text className="text-white text-4xl font-bold text-center">Connect an external provider</Text>
        <Text className="text-white/60 text-xl text-center">
          Use a model hosted somewhere else instead of downloading one to your phone. You can change this later.
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <View style={{ gap: 16 }} className="flex flex-col">
          <Text className="text-white font-semibold text-lg">Choose an LLM Provider</Text>
          <ProviderSelection
            selection={{ provider, config }}
            onChange={handleProviderSelection}
            excludeProviders={['native']}
          />
        </View>

        <View style={{ gap: 16, paddingHorizontal: 8 }} className="flex flex-col">
          <Text className="text-white font-semibold text-lg">Provider Settings</Text>
          {/* Remount options when the provider changes so their internal state resets */}
          <React.Fragment key={provider}>
            {renderProviderOptions()}
          </React.Fragment>
        </View>
      </ScrollView>

      <View className="flex flex-row gap-x-4 items-center justify-between">
        <TouchableOpacity onPress={() => setMode('simple')}>
          <Text className="text-[--primary-text] text-xl border border-[--primary-text] rounded-lg px-4 py-2">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!!validationError || saving}
          onPress={saveAndNavigate}
          className="disabled:opacity-50 bg-[--cta-light-blue] rounded-lg px-4 py-2 flex flex-row items-center justify-center"
        >
          <Text className="text-black text-xl">Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
