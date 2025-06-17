import { Text, View, Alert } from "react-native";
import React, { useState } from "react";
import { useNetInfo } from "@react-native-community/netinfo";
import MODEL_CARDS, { resolveDestinationPathFromGGUFUrl } from "@/utils/defaultModels";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import ModelCard from "./ModelCard";
import AwaitableAlert from "@/components/AwaitableAlert";
import * as RNFS from '@dr.pogodin/react-native-fs';

export default function SimpleModelSelection() {
  const netInfo = useNetInfo();
  const navigation = useNavigation<NavigationProp<any>>();
  const [selectedModel, setSelectedModel] = useState<typeof MODEL_CARDS[number]['id'] | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<typeof MODEL_CARDS[number]['tag'] | null>(null);

  const saveAndNavigate = async (modelOverride?: typeof MODEL_CARDS[number]) => {
    const model = modelOverride || MODEL_CARDS.find((card) => card.id === selectedModel);
    if (!model) return;

    console.log('saveAndNavigate::llmPreference', model.modelId)
    await uiStore.setToStorage('onboarding_model_selection_completed', true);
    await uiStore.setToStorage('llmPreference', { provider: 'native', config: { runtime: 'cpu', model: model.modelId } })
    navigation.navigate(PATHS.onboarding.survey as never)
    setDownloadUrl(null);
  }

  const onCardPress = async (id: typeof MODEL_CARDS[number]['id']) => {
    const nextModel = selectedModel === id ? null : id;
    setSelectedModel(nextModel);
    if (!nextModel) return;

    const model = MODEL_CARDS.find((card) => card.id === nextModel);
    if (!model) return;

    const destinationPath = resolveDestinationPathFromGGUFUrl(model.tag);
    const fileExists = await RNFS.exists(destinationPath);
    if (fileExists) return await saveAndNavigate(model);

    if (!netInfo.isConnected) {
      Alert.alert('No internet connection.', 'You will need to be connected to the internet to download any model.');
      return;
    }

    if (netInfo.type !== 'wifi') {
      const ignoreWarning = await AwaitableAlert(
        'Data usage warning',
        `We recommend using a Wi-Fi connection to download the model since it's ${model.size} in size.`,
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue Anyway', style: 'default' }
      );
      if (!ignoreWarning) return;
    } else {
      const confirmDownload = await AwaitableAlert(
        'Downloading model',
        `This will use ${model.size} of your device's storage. Click "OK" to continue.`,
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue with download', style: 'default' }
      );
      if (!confirmDownload) return;
    }
    setDownloadUrl(model.tag);
  }

  return (
    <React.Fragment>
      <View className="flex flex-col gap-y-4 justify-center items-center pb-[24px]">
        <Text className="text-white text-4xl font-bold text-center">What model would you like to use?</Text>
        <Text className="text-white/60 text-xl text-center">
          You can change this later, but pick the one that best suits your needs.
        </Text>
      </View>
      <View className="flex flex-col gap-y-4 items-center">
        {MODEL_CARDS.map((card, index) => (
          <ModelCard
            key={index}
            active={selectedModel === card.id}
            onPress={onCardPress}
            downloadInProgress={!!downloadUrl}
            downloadUrl={downloadUrl}
            onDownloadComplete={saveAndNavigate}
            {...card}
          />
        ))}
      </View>
    </React.Fragment>
  );
};