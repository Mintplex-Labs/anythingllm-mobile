import React from 'react';
import { View, TouchableOpacity, Text, Image, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import { Cube } from 'phosphor-react-native';
import MODEL_CARDS from '@/utils/models/defaults';

interface ModelCardProps {
  model: any;
  isSelected: boolean;
  isDownloaded: boolean;
  modelDownloadUrl: string | null;
  downloadProgress: number;
  onSelect: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function ModelCard({
  model,
  isSelected,
  isDownloaded,
  modelDownloadUrl,
  downloadProgress,
  onSelect,
  containerStyle = {},
}: ModelCardProps) {
  const getModelIcon = () => {
    if (model.imageUrl) {
      return (
        <Image source={{ uri: model.imageUrl }} style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center" />
      );
    }
    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    const Icon = defaultCard?.Icon || Cube;
    return (
      <View style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center">
        <Icon size={24} color={isSelected ? '#61baff' : '#000'} />
      </View>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{
        width: '90%',
        maxWidth: 380,
        maxHeight: 82,
        padding: 16,
        backgroundColor: isSelected ? '#7cd4fd65' : 'rgba(255, 255, 255, 0.1)',
        borderWidth: isSelected ? 2 : 0,
        borderColor: isSelected ? '#7cd4fd' : 'transparent',
        ...(containerStyle as object),
      }}
      className={`flex flex-row rounded-lg gap-x-4 items-center ${!!downloadProgress ? 'disabled:opacity-50' : ''}`}
      disabled={!!modelDownloadUrl && modelDownloadUrl !== model.downloadUrl}
      onPress={onSelect}
    >
      <View className="flex flex-row gap-x-4 items-center justify-between">
        {getModelIcon()}
        <View className="flex flex-col gap-y-1">
          <View className="flex flex-row gap-x-2 items-center">
            <Text className="text-white text-2xl font-bold">{model.name}</Text>
            {(modelDownloadUrl === model.downloadUrl && !isDownloaded) ? (
              <View className="flex-row items-center gap-2 ml-4">
                <ActivityIndicator size="small" color="#6ce9a6" />
                <Text className="text-xs text-white min-w-[32px]">
                  {downloadProgress}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            numberOfLines={2}
            style={{ maxWidth: '90%' }}
            ellipsizeMode="tail"
            className="text-white/60 text-sm">
            {model.description}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}