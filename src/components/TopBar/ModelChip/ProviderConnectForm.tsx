import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ArrowLeft } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import getLLM from '@/utils/AiProviders';
import { IAvailableModel } from '@/utils/AiProviders/baseOpenAILikeProvider';
import useLLMPreference from '@/hooks/useLLMPreference';
import useProviderConfigCache from '@/hooks/useProviderConfigCache';
import Telemetry from '@/utils/Telemetry';
import {
  baseUrlCandidates,
  findProviderDefinition,
  providerDisplayName,
  validateProviderConnection,
  type ProviderConfig,
} from '@/utils/llmproviders';

/**
 * Lists the provider's models with the given connection, retrying self-hosted URLs with /v1
 * appended. Returns the models found and the base URL that answered.
 */
async function discoverModels(provider: string, config: ProviderConfig, requiresBaseUrl: boolean) {
  for (const baseUrl of baseUrlCandidates(config.baseUrl ?? '', requiresBaseUrl)) {
    try {
      const llm = getLLM(provider, { ...config, baseUrl }) as { availableModels: () => Promise<IAvailableModel[]> };
      const result = await llm.availableModels();
      const models = Array.isArray(result) ? result.filter(m => !!m?.id) : [];
      if (models.length) return { models, baseUrl };
    } catch (error) {
      console.log(`[ModelChip] Could not list models for ${provider} (${baseUrl})`, error);
    }
  }
  return { models: [] as IAvailableModel[], baseUrl: config.baseUrl };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text className="text-[#9F9FA0] text-xs uppercase font-semibold">{label}</Text>
      {children}
    </View>
  );
}

const INPUT_STYLE = {
  height: 44,
  paddingHorizontal: 14,
  borderRadius: 8,
  backgroundColor: '#27282A',
  color: 'white',
} as const;

/**
 * Collects the connection details for a provider inside the model chip sheet. Nothing is saved
 * until the provider answers with its model list, so a typo never leaves the chat pointed at a
 * provider that cannot respond. When listing fails the user can still name a model by hand.
 */
export default function ProviderConnectForm({
  provider,
  onBack,
  onSave,
}: {
  provider: string;
  onBack: () => void;
  /** Persist the config and switch to it. `listed` is false when the model was typed by hand. */
  onSave: (config: ProviderConfig, listed: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { llmPreferences } = useLLMPreference();
  const { restore } = useProviderConfigCache();
  const definition = findProviderDefinition(provider);
  const providerName = providerDisplayName(provider);
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Start from whatever was saved for this provider so editing only needs the changed field.
  useEffect(() => {
    (async () => {
      const saved = provider === llmPreferences.provider ? llmPreferences.config : await restore(provider);
      setConfig({ ...(definition?.defaultConfig ?? {}), ...(saved ?? {}) });
    })();
  }, [provider]);

  if (!definition || !config) return <ActivityIndicator size="large" color="white" />;

  const update = (field: keyof ProviderConfig, value: string) => {
    setConfig(prev => ({ ...(prev ?? {}), [field]: value }));
    setError(null);
    if (field !== 'model') setStatus('idle');
  };

  const connect = async () => {
    const draft: ProviderConfig = {
      ...config,
      ...(definition.fields.apiKey !== false ? { apiKey: config.apiKey?.trim() ?? '' } : {}),
      ...(definition.fields.baseUrl ? { baseUrl: config.baseUrl?.trim() ?? '' } : {}),
      ...(definition.fields.region ? { region: config.region?.trim().toLowerCase() ?? '' } : {}),
    };
    const invalid = validateProviderConnection(provider, draft);
    if (invalid) return setError(invalid);

    // Listing already failed and the user typed a model - take their word for it.
    const manualModel = draft.model?.trim();
    if (status === 'failed' && manualModel) {
      await onSave({ ...draft, model: manualModel }, false);
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model: manualModel });
      return;
    }

    setStatus('connecting');
    const { models, baseUrl } = await discoverModels(provider, draft, definition.fields.baseUrl);
    if (!models.length) {
      setStatus('failed');
      return;
    }

    // Keep the previous model when it is still offered, else the provider's suggested default, else the first.
    const ids = models.map(m => m.id);
    const model = [draft.model, definition.modelPlaceholder].find(id => !!id && ids.includes(id)) ?? ids[0];
    await onSave({ ...draft, ...(definition.fields.baseUrl ? { baseUrl } : {}), model }, true);
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.LLM_SETTINGS_UPDATED, { provider, model });
  };

  const isConnecting = status === 'connecting';
  const buttonLabel = status === 'failed' && config.model?.trim()
    ? t('common.save')
    : t('top_bar.model_chip.connect');

  return (
    <View className="flex-1 w-full">
      <View className="flex flex-row items-center px-5 pb-3" style={{ gap: 12 }}>
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel={t('common.back')}>
          <ArrowLeft size={22} color="white" weight="bold" />
        </TouchableOpacity>
        <Image source={definition.logo} style={{ width: 28, height: 28 }} className="rounded-md" resizeMode="contain" />
        <Text className="text-white text-lg font-semibold flex-1" numberOfLines={1}>
          {t('top_bar.model_chip.connect_title', { provider: providerName })}
        </Text>
      </View>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}
        keyboardShouldPersistTaps="handled">
        {definition.fields.baseUrl && (
          <Field label={t('settings.provider_options.base_url')}>
            <BottomSheetTextInput
              value={config.baseUrl ?? ''}
              onChangeText={value => update('baseUrl', value)}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={definition.baseUrlPlaceholder}
              placeholderTextColor="#6B6B6E"
              style={INPUT_STYLE}
            />
          </Field>
        )}
        {definition.fields.apiKey !== false && (
          <Field label={definition.fields.apiKey === 'required' ? t('settings.provider_options.api_key') : t('settings.provider_options.api_key_optional')}>
            <BottomSheetTextInput
              value={config.apiKey ?? ''}
              onChangeText={value => update('apiKey', value)}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder={t('settings.provider_options.api_key_placeholder')}
              placeholderTextColor="#6B6B6E"
              style={INPUT_STYLE}
            />
          </Field>
        )}
        {definition.fields.region && (
          <Field label={t('settings.provider_options.aws_region')}>
            <BottomSheetTextInput
              value={config.region ?? ''}
              onChangeText={value => update('region', value)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={definition.defaultConfig.region}
              placeholderTextColor="#6B6B6E"
              style={INPUT_STYLE}
            />
          </Field>
        )}
        {status === 'failed' && (
          <View style={{ gap: 12 }}>
            <Text className="text-[#f87171] text-sm">
              {t('top_bar.model_chip.connect_failed', { provider: providerName })}
            </Text>
            <Field label={t('top_bar.model_chip.model')}>
              <BottomSheetTextInput
                value={config.model ?? ''}
                onChangeText={value => update('model', value)}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={definition.modelPlaceholder}
                placeholderTextColor="#6B6B6E"
                style={INPUT_STYLE}
              />
            </Field>
          </View>
        )}
        {!!error && <Text className="text-[#f87171] text-sm">{error}</Text>}
        <TouchableOpacity
          disabled={isConnecting}
          onPress={connect}
          className="flex flex-row items-center justify-center rounded-lg bg-white"
          style={{ height: 44, gap: 8, opacity: isConnecting ? 0.7 : 1 }}>
          {isConnecting && <ActivityIndicator size="small" color="#0E0F0F" />}
          <Text className="text-[#0E0F0F] text-base font-semibold">
            {isConnecting ? t('top_bar.model_chip.connecting') : buttonLabel}
          </Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </View>
  );
}
