import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Small "Experimental" pill shown next to providers flagged `experimental` in `AVAILABLE_LLM_PROVIDERS`.
 * Styled inline: NativeWind drops the color when `text-[#hex]` and `text-[Npx]` are combined on one element.
 */
export default function ExperimentalBadge() {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: '#F59E0B', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: '#1C1917', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
        {t('providers.experimental').toUpperCase()}
      </Text>
    </View>
  );
}
