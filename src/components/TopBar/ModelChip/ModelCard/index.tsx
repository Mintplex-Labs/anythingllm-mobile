import React from 'react';
import { View, TouchableOpacity, Text, Image } from 'react-native';
import { DownloadSimple, Cube } from 'phosphor-react-native';
import MODEL_CARDS from '@/utils/models/defaults';

interface ModelCardProps {
  model: any;
  isSelected: boolean;
  isDownloaded: boolean;
  modelDownloadUrl: string | null;
  downloadProgress: number;
  onSelect: () => void;
  onUninstall: () => void;
}

export default function ModelCard({
  model,
  isSelected,
  isDownloaded,
  modelDownloadUrl,
  downloadProgress,
  onSelect,
  onUninstall,
}: ModelCardProps) {
  const getModelIcon = () => {
    if (model.imageUrl) {
      return (
        <Image
          source={{ uri: model.imageUrl }}
          style={{ width: 24, height: 24 }}
          resizeMode="contain"
        />
      );
    }
    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    const Icon = defaultCard?.Icon || Cube;
    return <Icon size={24} color="#000" />;
  };

  return (
    <TouchableOpacity
      disabled={!!modelDownloadUrl && modelDownloadUrl !== model.downloadUrl}
      onPress={onSelect}
      style={{
        borderWidth: isSelected ? 2 : 0,
        borderColor: isSelected ? '#7cd4fd' : 'transparent',
        backgroundColor: isSelected ? '#2e404b' : '#2A2A2E',
      }}
      className="w-full p-4 rounded-lg flex-row items-center justify-between">
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View className="w-[32px] h-[32px] bg-white rounded justify-center items-center">
            {getModelIcon()}
          </View>
          <View className="flex-1">
            <Text className="text-white text-base font-medium">
              {model.name}
            </Text>
            {model.description && (
              <Text className="text-sm text-[#9F9FA0]">
                {model.description}
              </Text>
            )}
          </View>
          {modelDownloadUrl === model.downloadUrl ? (
            <View className="flex-row items-center gap-2 ml-4">
              <View className="w-[80px] h-[4px] bg-[#323235] rounded-full overflow-hidden">
                <View
                  className="h-full bg-[#6ce9a6] rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </View>
              <Text className="text-xs text-white min-w-[32px]">
                {downloadProgress}%
              </Text>
            </View>
          ) : isDownloaded ? (
            <TouchableOpacity onPress={onUninstall} className="px-3 py-1 ml-4">
              <Text className="text-red-500">Uninstall</Text>
            </TouchableOpacity>
          ) : (
            <View className="w-[24px] h-[24px] justify-center items-center ml-4">
              <DownloadSimple size={24} color="#ffffff" weight="bold" />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
