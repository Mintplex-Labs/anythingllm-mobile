import { useCallback } from 'react';
import uiStore from '@/store/UIStore';
import type { ProviderConfig } from '@/utils/llmproviders';

type ConfigCache = Record<string, ProviderConfig>;
const STORAGE_KEY = 'provider_config_cache' as const;

function hasValues(config: ProviderConfig): boolean {
  return Object.values(config).some(v => typeof v === 'string' && v.trim().length > 0);
}

export default function useProviderConfigCache() {
  const save = useCallback(async (provider: string, config: ProviderConfig) => {
    if (provider === 'native') return;
    const cache = await uiStore.getFromStorage<ConfigCache>(STORAGE_KEY, {});
    if (hasValues(config)) {
      cache[provider] = { ...config };
    } else {
      delete cache[provider];
    }
    await uiStore.setToStorage(STORAGE_KEY, cache);
  }, []);

  const restore = useCallback(async (provider: string): Promise<ProviderConfig | null> => {
    const cache = await uiStore.getFromStorage<ConfigCache>(STORAGE_KEY, {});
    return cache[provider] ?? null;
  }, []);

  const cachedProviders = useCallback(async (): Promise<string[]> => {
    const cache = await uiStore.getFromStorage<ConfigCache>(STORAGE_KEY, {});
    return Object.entries(cache)
      .filter(([, config]) => hasValues(config))
      .map(([key]) => key);
  }, []);

  return { save, restore, cachedProviders };
}
