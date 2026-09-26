import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Plus } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';

/**
 * Entry point to the Hugging Face import flow. Shown at the bottom of the
 * on-device model lists (model picker sheet and settings screen).
 */
export default function AddFromHuggingFaceCard({ onPress, hint }: { onPress: () => void; hint?: string }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ borderWidth: 1, borderColor: '#3f3f46', borderStyle: 'dashed' }}
      className="w-full p-4 rounded-xl flex-row items-center bg-[#1B1B1E]">
      <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white/10">
        <Plus size={22} color="#ffffff" weight="bold" />
      </View>
      <View className="flex-1 ml-2">
        <Text className="text-white text-base font-medium">{t('hf_import.title')}</Text>
        <Text className="text-sm text-[#9F9FA0]">
          {hint || t('hf_import.add_card_hint')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
