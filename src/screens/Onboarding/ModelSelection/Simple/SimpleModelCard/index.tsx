import React from 'react';
import { View, TouchableOpacity, Text, Image, StyleProp, ViewStyle } from 'react-native';
import { Cube } from 'phosphor-react-native';
import MODEL_CARDS from '@/utils/models/defaults';
import { DownloadSurface, DownloadStatus } from '@/components/DownloadSurface';
import { MemoryFitBadge, RecommendedBadge, RECOMMENDED_COLOR } from '@/components/ModelCard/FitBadges';
import type { MemoryFit } from '@/utils/models/memoryFit';

interface ModelCardProps {
  model: any;
  isSelected: boolean;
  isDownloaded: boolean;
  modelDownloadUrl: string | null;
  downloadProgress: number;
  onSelect: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  /** Device-memory verdict for this preset, see `useModelFit`. null/undefined shows no badge. */
  memoryFit?: MemoryFit | null;
  /** Calls the preset out as the best pick for this phone. */
  isRecommended?: boolean;
}

export default function ModelCard({
  model,
  isSelected,
  isDownloaded,
  modelDownloadUrl,
  downloadProgress,
  onSelect,
  containerStyle = {},
  memoryFit = null,
  isRecommended = false,
}: ModelCardProps) {
  const getModelIcon = () => {
    if (model.imageUrl) {
      return (
        <Image source={{ uri: model.imageUrl }} style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center" />
      );
    }
    // Preset alias rows use their phosphor icon; matched on the preset id, not the
    // modelId, which is shared with the catalog entry for the same model.
    const defaultCard = model.isPreset
      ? MODEL_CARDS.find(card => card.id === model.id)
      : undefined;
    const Icon = defaultCard?.Icon || Cube;
    return (
      <View style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center">
        <Icon size={24} color={isSelected ? '#61baff' : '#000'} />
      </View>
    );
  };

  const isDownloading = modelDownloadUrl === model.downloadUrl && !isDownloaded;
  const hasBadge = isRecommended || (!!memoryFit && memoryFit !== 'ok');

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{
        width: '90%',
        maxWidth: 380,
        padding: 16,
        backgroundColor: isSelected ? '#7cd4fd65' : 'rgba(255, 255, 255, 0.1)',
        // Selection and an active download win; otherwise the recommended preset gets a
        // thin accent border so it stands out before the user reads the badge.
        borderWidth: isSelected ? 2 : isRecommended || isDownloading ? 1 : 0,
        borderColor: isDownloading ? '#6ce9a6' : isSelected ? '#7cd4fd' : isRecommended ? RECOMMENDED_COLOR : 'transparent',
        overflow: 'hidden',
        ...(containerStyle as object),
      }}
      className={`flex flex-row rounded-lg gap-x-4 items-center ${!!downloadProgress ? 'disabled:opacity-50' : ''}`}
      disabled={!!modelDownloadUrl && modelDownloadUrl !== model.downloadUrl}
      onPress={onSelect}
    >
      <DownloadSurface active={isDownloading} progress={downloadProgress} borderRadius={8} />
      <View className="flex flex-row gap-x-4 items-center flex-1">
        {getModelIcon()}
        <View className="flex flex-col gap-y-1 flex-1">
          <View className="flex flex-row gap-x-2 items-center" style={{ flexWrap: 'wrap', rowGap: 4 }}>
            <Text className="text-white text-2xl font-bold">{model.name}</Text>
            {hasBadge && !isDownloading && (
              <View className="flex flex-row items-center" style={{ gap: 6 }}>
                {/* Recommended already implies a good fit, so only one of the two pills shows. */}
                {isRecommended ? <RecommendedBadge size="md" /> : <MemoryFitBadge fit={memoryFit} size="md" compact />}
              </View>
            )}
            {isDownloading ? (
              <View className="flex-row items-center ml-4">
                <DownloadStatus progress={downloadProgress} size="lg" />
              </View>
            ) : null}
          </View>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            className="text-white/60 text-sm">
            {model.description}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
