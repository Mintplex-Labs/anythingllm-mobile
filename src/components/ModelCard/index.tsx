import React from 'react';
import { View, TouchableOpacity, Text, Image } from 'react-native';
import { DownloadSimple, Cube, Question } from 'phosphor-react-native';
import MODEL_CARDS from '@/utils/models/defaults';
import { findMonoProviderIcon } from '@/components/MonoProviderIcon';
import truncate from 'truncate';
import { DownloadRing } from '@/components/DownloadSurface';

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
    // Only the preset alias rows (Lightweight/Balanced/Powerful) use their phosphor icon.
    // The catalog entry for the same model keeps its provider mark, so match on the
    // preset id rather than the shared modelId.
    const defaultCard = model.isPreset
      ? MODEL_CARDS.find(card => card.id === model.id)
      : undefined;
    if (defaultCard?.Icon) {
      const Icon = defaultCard.Icon;
      return (
        <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white">
          <Icon size={32} color="#000" />
        </View>
      );
    }

    // Bundled mono brand mark, resolved from the model name/id or its provider.
    // No network fetch needed so new models get a logo as soon as they are added.
    const MonoIcon = findMonoProviderIcon({
      provider: model.provider,
      modelName: model.modelId || model.id || model.name,
    });
    if (MonoIcon) {
      return (
        <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white">
          <MonoIcon width={26} height={26} color="#000" style={{}} />
        </View>
      );
    }

    // Legacy remote avatar for anything we could not match to a bundled icon.
    if (model.imageUrl) {
      return (
        <Image
          source={{ uri: model.imageUrl }}
          style={{ width: '100%', height: '100%', borderRadius: 10 }}
          resizeMode="cover"
        />
      );
    }

    const Icon = model.isUnknown ? Question : Cube;
    return (
      <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white">
        <Icon size={32} color="#000" />
      </View>
    );
  };

  const isDownloading = modelDownloadUrl === model.downloadUrl;

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
            <View className="flex-row items-center gap-2">
              <Text className="text-white text-base font-medium" numberOfLines={1}>
                {model.name}
              </Text>
              {model.isUnknown && (
                <View className="rounded-full px-2 py-0.5 bg-yellow-500/30">
                  <Text className="text-yellow-200 text-[10px] font-medium">Unknown</Text>
                </View>
              )}
            </View>
            {model.description && (
              <Text className="text-sm text-[#9F9FA0]">
                {truncate(model.description, 100)}
              </Text>
            )}
          </View>
          {isDownloading ? (
            <View className="flex-row items-center ml-4">
              <DownloadRing progress={downloadProgress} />
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
