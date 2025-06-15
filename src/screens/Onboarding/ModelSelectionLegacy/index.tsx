import { Text, TouchableOpacity, View, Alert } from "react-native";
import SafeView from "@/components/SafeView";
import uiStore from "@/store/UIStore";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import { Fragment, useState, useEffect } from "react";
import ProviderSelection from "@/components/LLMSelection/ProviderSelection";
import { AVAILABLE_LLM_PROVIDERS } from "@/utils/llmproviders";
import { ActivityIndicator } from "react-native-paper";

export interface ISelection {
  provider: string;
  config: Record<string, any>;
}

async function confirmSelection(
  selection: ISelection,
  setIsLoading: (isLoading: boolean) => void,
  byPassConfirmation: boolean = false,
  navigation: NavigationProp<any>
) {
  const saveAndNavigate = async () => {
    console.log('saveAndNavigate::llmPreference', selection)
    await uiStore.setToStorage('onboarding_model_selection_completed', true);
    await uiStore.setToStorage('llmPreference', selection)
    navigation.navigate(PATHS.home as never)
  }

  try {
    setIsLoading(true);
    if (!byPassConfirmation) {
      Alert.alert('Are you sure?', 'This will replace your current model', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: async () => await saveAndNavigate() }
      ])
    } else await saveAndNavigate();
  } catch (error) {
    console.error('Error confirming selection', error)
  } finally {
    setIsLoading(false);
  }
}

export default function OnboardingModelSelection() {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [selection, setSelection] = useState<ISelection>({
    provider: 'native',
    config: {}
  });

  function handleProviderChange(provider: string) {
    setSelection((prev) => ({
      ...prev,
      provider
    }));
  }

  function handleConfigChange(config: Record<string, any>, autoConfirm = false) {
    let newSelection = {
      ...selection,
      config
    }
    setSelection(newSelection);
    // @ts-ignore
    if (autoConfirm) confirmSelection(newSelection, setIsLoading, autoConfirm, navigation);
  }

  const providerOptions = AVAILABLE_LLM_PROVIDERS.find(p => p.value === selection.provider)?.options || AVAILABLE_LLM_PROVIDERS[0].options;
  return (
    <SafeView scrollable={isLoading === false} containerClassNames="!p-0">
      {isLoading && (
        <Fragment>
          <View className="absolute w-full h-[200vh] bg-black/80 z-50" />
          <View className="absolute w-full h-full flex items-center justify-center z-50">
            <ActivityIndicator size="large" color="white" />
          </View>
        </Fragment>
      )}
      <View className="flex h-[90vh]">
        <View className="flex flex-col gap-y-2 w-full items-center justify-center pt-4">
          <Text className="text-white text-2xl font-bold">Model Selection</Text>
          <Text className="text-[--secondary-text] text-sm text-center">
            You can change this later in the settings. {'\n'}It will be used for all your conversations by default.
          </Text>
        </View>
        <ProviderSelection selection={selection} onChange={handleProviderChange} />
        {providerOptions?.(selection, handleConfigChange)}
      </View>
      <View className="flex flex-col gap-y-2 w-full items-center justify-center pt-4">
        <TouchableOpacity
          onPress={() => Alert.alert('Not implemented', 'This feature is not implemented yet')}
          className="bg-transparent pb-10"
        >
          <Text className="text-blue-500 text-md">Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeView>
  );
};