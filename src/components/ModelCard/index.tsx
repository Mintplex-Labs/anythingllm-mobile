import React from 'react';
import { View, TouchableOpacity, Text, Image } from 'react-native';
import { DownloadSimple, Cube } from 'phosphor-react-native';
import MODEL_CARDS from '@/utils/models/defaults';
import truncate from 'truncate';

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
          style={{ width: '100%', height: '100%', borderRadius: 10 }}
          resizeMode="cover"
        />
      );
    }
    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    const Icon = defaultCard?.Icon || Cube;
    return (
      <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white">
        <Icon size={32} color="#000" />
      </View>
    );
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
      className="w-full p-4 rounded-xl flex-row items-center justify-between">
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View className="w-[38px] h-[38px] rounded justify-center items-center">
            {getModelIcon()}
          </View>
          <View className="flex-1">
            <Text className="text-white text-base font-medium">
              {model.name}
            </Text>
            {model.description && (
              <Text className="text-sm text-[#9F9FA0]">
                {truncate(model.description, 100)}
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
              <Text className="text-white font-medium text-sm py-2 px-4 bg-white/10 rounded-lg">
                Uninstall
              </Text>
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
