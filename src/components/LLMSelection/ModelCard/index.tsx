import { Image, StyleProp, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import React from "react";
import MODEL_CARDS from "@/utils/models/defaults";
import DownloadProgress from "@/screens/Onboarding/ModelSelection/DownloadProgress";

type ModelCardProps = {
  id: string;
  name: string;
  description: string;
  Icon: React.ElementType;
  imageUrl?: string;
  tag: typeof MODEL_CARDS[number]['tag'];
  active: boolean;
  downloadInProgress: boolean;
  downloadUrl: typeof MODEL_CARDS[number]['tag'] | null;
  onPress: (id: typeof MODEL_CARDS[number]['id']) => void;
  onDownloadComplete: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Model card for the native provider - may be reused for other providers
 */
export default function ModelCard({
  id,
  name,
  description,
  Icon,
  imageUrl,
  active,
  onPress,
  downloadInProgress = false,
  downloadUrl = null, tag,
  onDownloadComplete,
  containerStyle = {},
}: ModelCardProps) {
  const isDownloading = downloadUrl === tag;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{
        width: '90%',
        maxWidth: 380,
        maxHeight: 82,
        padding: 16,
        backgroundColor: active ? '#7cd4fd65' : 'rgba(255, 255, 255, 0.1)',
        borderWidth: active ? 2 : 0,
        borderColor: active ? '#7cd4fd' : 'transparent',
        ...(containerStyle as object),
      }}
      className={`flex flex-row rounded-lg gap-x-4 items-center ${!isDownloading ? 'disabled:opacity-50' : ''
        }`}
      disabled={!!downloadInProgress}
      onPress={() => {
        if (isDownloading) return;
        onPress(id);
      }}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center" />
      ) : (
        <View style={{ width: 48, height: 48 }} className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center">
          <Icon size={24} color={active ? '#61baff' : '#000'} />
        </View>
      )}

      <View className="flex flex-col gap-y-1">
        <View className="flex flex-row gap-x-2 items-center">
          <Text className="text-white text-2xl font-bold">{name}</Text>
          {isDownloading && <DownloadProgress downloadUrl={tag} onComplete={onDownloadComplete} />}
        </View>
        <Text
          numberOfLines={2}
          style={{ maxWidth: '90%' }}
          ellipsizeMode="tail"
          className="text-white/60 text-sm">
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  )
}