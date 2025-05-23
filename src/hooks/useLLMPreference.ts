import { useState, useEffect } from "react";
import uiStore from "@/store/UIStore";
import getLLM, { LLMProvider } from "@/utils/AiProviders";

export default function useLlmPreference(): {
  llmPreferences: { provider: string, config: any },
  LLMProvider: LLMProvider,
  isLoading: boolean,
  error: Error | null,
  fetchLLMPreference: () => Promise<void>
} {
  const [llmPreferences, setLlmPreferences] = useState<{ provider: string, config: any }>({ provider: 'unknown', config: {} });
  // @ts-ignore
  const [LLMProvider, setLLMProvider] = useState<LLMProvider>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function fetchLLMPreference() {
    try {
      const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} });
      setLlmPreferences(preferences);
      setLLMProvider(getLLM(preferences.provider, preferences.config));
    } catch (error) {
      console.error('Error getting LLM preferences:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLLMPreference();
  }, []);

  return { llmPreferences, LLMProvider, isLoading, error, fetchLLMPreference };
}