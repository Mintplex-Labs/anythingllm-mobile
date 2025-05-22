import { useState, useEffect } from "react";
import uiStore from "@/store/UIStore";
import getLLM from "@/utils/AiProviders";
import OpenAICompatible from "@/utils/AiProviders/openAICompatible";

export default function useLlmPreference(): {
  llmPreferences: { provider: string, config: any },
  LLMProvider: OpenAICompatible,
  isLoading: boolean
} {
  const [llmPreferences, setLlmPreferences] = useState<{ provider: string, config: any }>({ provider: 'unknown', config: {} });
  // @ts-ignore
  const [LLMProvider, setLLMProvider] = useState<OpenAICompatible>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} })
      .then((preferences) => {
        setLlmPreferences(preferences);
        setLLMProvider(getLLM(preferences.provider, preferences.config));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return { llmPreferences, LLMProvider, isLoading };
}