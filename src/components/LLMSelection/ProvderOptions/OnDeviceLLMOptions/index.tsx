import { ISelection } from "@/screens/Onboarding/ModelSelection";
import { View, Text, TouchableOpacity, Alert, ScrollView } from "react-native";
import { defaultModels } from "@/utils/models";
import { Model, NPUEnabledModel } from "@/utils/types";
import { formatBytes } from "@/utils/formatters";
import { useState } from "react";

export default function OnDeviceLLMOptions({ selection, onChange }: { selection: ISelection, onChange: (config: Record<string, any>, autoConfirm?: boolean) => void }) {
  const [selectedModel, setSelectedModel] = useState<Model | NPUEnabledModel | null>(selection.config.model);
  const [isConfirming, setIsConfirming] = useState(false);

  function handleModelSelection(model: Model | NPUEnabledModel) {
    if (isConfirming) return;

    setSelectedModel(model);
    setIsConfirming(true);
    Alert.alert('Download model?', `This will download the model to your device. It is ${formatBytes(model.size)} bytes.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => setIsConfirming(false) },
      {
        text: 'OK', onPress: () => {
          onChange({ model: model.id }, true)
          setIsConfirming(false);
        }
      }
    ])
  }

  return (
    <View className="flex-1 px-4 mt-6 h-full justify-start">
      <Text className="text-lg font-bold text-white mb-4">Preferred Model</Text>
      <ScrollView className="h-[80vh]">
        <View className="flex-col gap-y-4">
          {defaultModels?.map((model) => {
            const isSelected = model.id === selectedModel?.id;
            const bgColor = isSelected ? 'bg-blue-100' : ' bg-[--secondary-bg] ';
            const textColor = isSelected ? 'text-black' : 'text-white'
            const badgeColor = model.runtime === 'NPU' ? 'bg-purple-500/50' : 'bg-green-300/50';
            return (
              <TouchableOpacity
                key={model.id}
                onPress={() => handleModelSelection(model)}
                activeOpacity={0.7}
                className={`flex-col rounded-lg px-2 py-4 ${bgColor}`}
              >
                <View className="flex-row items-center gap-x-2 justify-between w-full">
                  <Text className={`${textColor} text-sm font-bold`}>{model.name}</Text>
                  <View className={`rounded-full px-2 py-1 ${badgeColor}`}>
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