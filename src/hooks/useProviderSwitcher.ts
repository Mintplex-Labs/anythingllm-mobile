import { useCallback, useEffect, useState } from 'react';
import uiStore from '@/store/UIStore';
import useLLMPreference from '@/hooks/useLLMPreference';
import useProviderConfigCache from '@/hooks/useProviderConfigCache';
import { findProviderDefinition, validateProviderConnection, type ProviderConfig } from '@/utils/llmproviders';

const NATIVE_CONFIG_KEY = 'native_config_cache' as const;

/**
 * Swaps the active LLM provider while remembering each provider's settings, so switching back
 * later restores its credentials and model instead of starting from scratch.
 * On-device is stashed separately from the external provider cache so it never reads as a
 * "configured" credential set, but its last model still comes back when you return to it.
 */
export default function useProviderSwitcher() {
  const { llmPreferences, updateLLMPreference } = useLLMPreference();
  const { save, restore, cachedProviders } = useProviderConfigCache();
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);

  // Only providers whose saved settings can actually connect count - a stash of just the default
  // base URL (eg. OpenAI picked and abandoned) should not be pinned as ready to use.
  const refreshConfiguredProviders = useCallback(async () => {
    const keys = await cachedProviders();
    const configs = await Promise.all(keys.map(key => restore(key)));
    setConfiguredProviders(keys.filter((key, i) => !!configs[i] && !validateProviderConnection(key, configs[i]!)));
  }, [cachedProviders, restore]);

  useEffect(() => {
    refreshConfiguredProviders();
  }, [refreshConfiguredProviders]);

  /**
   * Switch to `provider`. With no `config` the provider's last saved settings are restored
   * (or its defaults when it was never set up). Returns the config that was applied.
   */
  const switchProvider = useCallback(async (provider: string, config?: ProviderConfig) => {
    if (llmPreferences.provider === 'native') await uiStore.setToStorage(NATIVE_CONFIG_KEY, llmPreferences.config ?? {});
    else await save(llmPreferences.provider, llmPreferences.config ?? {});

    let next: ProviderConfig;
    if (config) next = config;
    else if (provider === 'native') next = await uiStore.getFromStorage<ProviderConfig>(NATIVE_CONFIG_KEY, {});
    else next = (await restore(provider)) ?? { ...(findProviderDefinition(provider)?.defaultConfig ?? {}) };

    await updateLLMPreference(provider, next);
    if (config && provider !== 'native') await save(provider, next);
    await refreshConfiguredProviders();
    return next;
  }, [llmPreferences, updateLLMPreference, save, restore, refreshConfiguredProviders]);

  return { configuredProviders, refreshConfiguredProviders, switchProvider };
}
