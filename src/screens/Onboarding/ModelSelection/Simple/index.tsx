import { Text, View } from "react-native";
import React, { useEffect, useState } from "react";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import useModelManager from "@/hooks/useModelManager";
import useLlmPreference from "@/hooks/useLLMPreference";
import { AvailableModel } from "@/components/TopBar/ModelChip";
import SimpleModelCard from "./SimpleModelCard";
import getLLM from '@/utils/AiProviders';
import PushNotifications from "@/utils/PushNotifications";

// During onboarding, this config will not yet be set in the UIStore, so we need set the default here
const DEFAULT_LLM_PREFERENCE = { provider: 'native', config: { runtime: 'cpu', model: null } } as const;

export default function SimpleModelSelection() {
  const navigation = useNavigation<NavigationProp<any>>();
  const LLMProvider = getLLM(DEFAULT_LLM_PREFERENCE.provider, DEFAULT_LLM_PREFERENCE.config);
  const llmPreferences = DEFAULT_LLM_PREFERENCE;
  const { fetchLLMPreference } = useLlmPreference();
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    runPreDownloadConfirmations,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  const saveAndNavigate = async (modelOverride?: AvailableModel) => {
    const model = modelOverride || availableModels.find((card) => card.modelId === selectedModel);
    if (!model) return;

    await uiStore.setToStorage('onboarding_model_selection_completed', true);
    await uiStore.setToStorage('llmPreference', { provider: 'native', config: { runtime: 'cpu', model: model.modelId } });
    navigation.navigate(PATHS.onboarding.survey as never)
  }

  useEffect(() => {
    const fetchModels = async () => {
      if (LLMProvider) {
        const models = (await LLMProvider.availableModels() ?? []) as AvailableModel[];
        setAvailableModels(models.filter(model => model.isPreset));
      } else setAvailableModels([]);
    }
    fetchModels();
  }, [LLMProvider]);

  return (
    <React.Fragment>
      <View className="flex flex-col gap-y-4 justify-center items-center pb-[24px]">
        <Text className="text-white text-4xl font-bold text-center">What model would you like to use?</Text>
        <Text className="text-white/60 text-xl text-center">
          You can change this later, but pick the one that best suits your needs.
        </Text>
      </View>
      <View className="flex flex-col items-center" style={{ gap: 16 }}>
        {availableModels.map((card, index) => (
          <SimpleModelCard
            key={index}
            model={card}
            isSelected={selectedModel === card.modelId}
            isDownloaded={downloadedModels[card.modelId]}
            modelDownloadUrl={modelDownloadUrl}
            downloadProgress={downloadProgress}
            onSelect={async () => {
              // If the user has not granted permissions to receive notifications we cannot download models in the background
              // so we need to await the entire download process
              if (PushNotifications.notificationsEnabled) {
                const approved = await runPreDownloadConfirmations(card);
                if (!approved) return false;
                downloadModel(card, false);
                await saveAndNavigate(card);
                return;
              }

              // Manually run the pre-download confirmation checks since we need to confirm
              // the user approved the download before we navigate to the next screen
              // Notifications will provide progress updates so we can move to the next screen while the download is in progress
              const approved = await runPreDownloadConfirmations(card);
              if (!approved) return false;
              const result = await downloadModel(card, false);
              if (result !== false) await saveAndNavigate(card);
            }}
          />
        ))}
      </View>
    </React.Fragment>
  );
};