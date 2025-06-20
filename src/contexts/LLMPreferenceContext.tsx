import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import uiStore from '@/store/UIStore';
import getLLM, { LLMProvider } from '@/utils/AiProviders';
import { OnDeviceProviderConstructorProps } from '@/utils/AiProviders/onDevice';
import { OpenAICompatibleConfig } from '@/utils/AiProviders/openAICompatible';

interface LLMPreferenceContextType {
    llmPreferences: { provider: string; config: any };
    LLMProvider: LLMProvider | null;
    isLoading: boolean;
    error: Error | null;
    fetchLLMPreference: () => Promise<void>;
    updateLLMPreference: (provider: string, config: any) => Promise<void>;
}

const LLMPreferenceContext = createContext<LLMPreferenceContextType | null>(null);

export function LLMPreferenceProvider({ children }: { children: ReactNode }) {
    const [llmPreferences, setLlmPreferences] = useState<{ provider: string; config: any }>({
        provider: 'unknown',
        config: {},
    });
    const [LLMProvider, setLLMProvider] = useState<LLMProvider | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    async function fetchLLMPreference() {
        try {
            setIsLoading(true);
            setError(null);
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

    async function updateLLMPreference(provider: string, config: any) {
        try {
            const newPreferences = { provider, config };
            await uiStore.setToStorage('llmPreference', newPreferences);
            setLlmPreferences(newPreferences);
            setLLMProvider(getLLM(provider, config));
        } catch (error) {
            console.error('Error updating LLM preferences:', error);
            setError(error as Error);
        }
    }

    // Listen for changes to the LLM preference so we can update the LLM provider across the app
    useEffect(() => {
        const handleLLMPreferenceChange = (event: { details: { provider: string, config: OnDeviceProviderConstructorProps['config'] | OpenAICompatibleConfig['config'] } }) => {
            setLlmPreferences(event.details);
            let llmProvider: LLMProvider | null = null;
            switch (event.details.provider) {
                case 'native':
                    const onDeviceConfig = event.details.config as OnDeviceProviderConstructorProps['config'];
                    llmProvider = getLLM(event.details.provider, onDeviceConfig);
                    llmProvider.loadNewModel(onDeviceConfig!.model);
                    break;
                case 'openai':
                    const openAIConfig = event.details.config as OpenAICompatibleConfig['config'];
                    llmProvider = getLLM(event.details.provider, openAIConfig);
                    llmProvider.loadNewModel(openAIConfig!.modelId!);
                    break;
            }
            setLLMProvider(llmProvider);
        };

        uiStore.emitter.addListener('llmPreference', handleLLMPreferenceChange);
        return () => uiStore.emitter.removeAllListeners('llmPreference');
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchLLMPreference();
    }, []);

    return (
        <LLMPreferenceContext.Provider
            value={{
                llmPreferences,
                LLMProvider,
                isLoading,
                error,
                fetchLLMPreference,
                updateLLMPreference,
            }}
        >
            {children}
        </LLMPreferenceContext.Provider>
    );
}

export function useLLMPreference() {
    const context = useContext(LLMPreferenceContext);
    if (!context) throw new Error('useLLMPreference must be used within a LLMPreferenceProvider');
    return context;
} 