import { ISelection } from "@/screens/Onboarding/ModelSelection";
import { View, Text, TouchableOpacity, Alert, ScrollView } from "react-native";
import { defaultModels } from "@/utils/models";
import { Model } from "@/utils/types";
import { formatBytes } from "@/utils/formatters";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function OnDeviceLLMOptions({ selection, onChange }: { selection: ISelection, onChange: (config: Record<string, any>, autoConfirm?: boolean) => void }) {
  const { t } = useTranslation();
  const [selectedModel, setSelectedModel] = useState<Model | null>(selection.config.model);
  const [isConfirming, setIsConfirming] = useState(false);

  function handleModelSelection(model: Model) {
    if (isConfirming) return;

    setSelectedModel(model);
    setIsConfirming(true);
    Alert.alert(t('llm_selection.download_model_title'), t('llm_selection.download_model_message', { size: formatBytes(model.size) }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setIsConfirming(false) },
      {
        text: t('common.ok'), onPress: () => {
          onChange({ model: model.id }, true)
          setIsConfirming(false);
        }
      }
    ])
  }

  return (
    <View className="flex-1 px-4 mt-6 h-full justify-start">
      <Text className="text-lg font-bold text-white mb-4">{t('llm_selection.preferred_model')}</Text>
      <ScrollView className="h-[80vh]">
        <View className="flex-col gap-y-4">
          {defaultModels?.map((model) => {
            const isSelected = model.id === selectedModel?.id;
            const bgColor = isSelected ? 'bg-blue-100' : ' bg-[--secondary-bg] ';
            const textColor = isSelected ? 'text-black' : 'text-white'
            return (
              <TouchableOpacity
                key={model.id}
                onPress={() => handleModelSelection(model)}
                activeOpacity={0.7}
                className={`flex-col rounded-lg px-2 py-4 ${bgColor}`}
              >
                <View className="flex-row items-center gap-x-2 justify-between w-full">
                  <Text className={`${textColor} text-sm font-bold`}>{model.name}</Text>
                  <View className="rounded-full px-2 py-1 bg-green-300/50">
                    <Text className="text-white text-xs">{model.runtime}</Text>
                  </View>
                </View>
                <Text className={`${textColor} text-xs italic`}>{model.capabilities?.join(', ')} | {formatBytes(model.size)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}