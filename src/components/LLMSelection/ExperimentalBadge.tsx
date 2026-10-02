import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/** Small "Experimental" pill shown next to providers flagged `experimental` in `AVAILABLE_LLM_PROVIDERS`. */
export default function ExperimentalBadge() {
  const { t } = useTranslation();
  return (
    <View className="rounded-full border border-[#F59E0B]/60" style={{ paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text className="text-[#F59E0B] text-[10px] font-semibold uppercase">{t('providers.experimental')}</Text>
    </View>
  );
}
