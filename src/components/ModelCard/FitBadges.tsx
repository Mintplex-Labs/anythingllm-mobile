import React from 'react';
import { View, Text } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { MEMORY_FIT_LABELS, MemoryFit } from '@/utils/models/memoryFit';

/**
 * Pills that describe how a model relates to the phone it is being viewed on.
 * Shared by the Hugging Face quant list, the catalog cards and the onboarding presets
 * so the same verdict looks the same everywhere.
 */

type BadgeSize = 'sm' | 'md';

const TEXT_SIZE: Record<BadgeSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
};
const PAD: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5',
  md: 'px-2.5 py-1',
};

/** Accent used for the "best for your device" callout: badge, card border and header copy. */
export const RECOMMENDED_COLOR = '#c4b5fd';
export const RECOMMENDED_BG = 'rgba(196, 181, 253, 0.18)';

export function MemoryFitBadge({
  fit,
  size = 'sm',
  compact = false,
}: {
  fit: MemoryFit | null;
  size?: BadgeSize;
  compact?: boolean;
}) {
  // Only warn. A model that fits (or an unknown verdict) shows nothing, matching the HF picker.
  if (!fit || fit === 'ok') return null;
  const label = MEMORY_FIT_LABELS[fit][compact ? 'compact' : 'full'];
  const tone = fit === 'tight'
    ? { bg: 'bg-yellow-500/30', text: 'text-yellow-200' }
    : { bg: 'bg-red-500/30', text: 'text-red-300' };
  return (
    <View className={`rounded-full ${PAD[size]} ${tone.bg}`}>
      <Text className={`${tone.text} ${TEXT_SIZE[size]} font-medium`}>{label}</Text>
    </View>
  );
}

export function RecommendedBadge({
  size = 'sm',
  label = 'Recommended',
}: {
  size?: BadgeSize;
  label?: string;
}) {
  const iconSize = size === 'sm' ? 10 : 12;
  return (
    <View
      className={`rounded-full flex-row items-center ${PAD[size]}`}
      style={{ backgroundColor: RECOMMENDED_BG, gap: 4 }}>
      <Sparkle size={iconSize} color={RECOMMENDED_COLOR} weight="fill" />
      <Text className={`${TEXT_SIZE[size]} font-medium`} style={{ color: RECOMMENDED_COLOR }}>{label}</Text>
    </View>
  );
}
