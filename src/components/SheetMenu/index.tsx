import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CaretLeft, CaretRight } from 'phosphor-react-native';

/** Shared palette for the dark option sheets (thread menu, message actions, ...) */
export const SHEET_BACKGROUND = '#1B1B1E';
export const ROW_ICON_BACKGROUND = '#3f3f42';
export const MUTED_TEXT = '#9F9FA0';
export const SUCCESS = '#46C08A';
export const DANGER = '#F97066';

/** Centered title with optional back caret and a single-line muted subtitle */
export function SheetHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={{ marginBottom: 18 }} className="flex flex-col items-center">
      <View className="flex w-full flex-row items-center justify-center" style={{ minHeight: 28 }}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={{ position: 'absolute', left: 0 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Back">
            <CaretLeft size={24} color="#FFF" />
          </TouchableOpacity>
        )}
        <Text className="text-white text-lg font-medium">{title}</Text>
      </View>
      {!!subtitle && (
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: MUTED_TEXT, marginTop: 2, maxWidth: '80%' }} className="text-sm">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

/** One tappable option: circular icon chip, title, optional description and a trailing caret */
export function MenuRow({
  icon,
  title,
  description,
  onPress,
  disabled = false,
  trailing,
  titleColor = '#FFF',
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Right-hand slot. Defaults to a caret; pass `null` to render nothing. */
  trailing?: React.ReactNode;
  titleColor?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ gap: 14, paddingVertical: 10, opacity: disabled ? 0.5 : 1 }}
      className="flex flex-row items-center">
      <View style={{ backgroundColor: ROW_ICON_BACKGROUND, width: 44, height: 44 }} className="flex items-center justify-center rounded-full">
        {icon}
      </View>
      <View className="flex-1 flex flex-col">
        <Text style={{ color: titleColor }} className="text-lg font-medium">{title}</Text>
        {!!description && <Text style={{ color: MUTED_TEXT }} className="text-sm">{description}</Text>}
      </View>
      {trailing === undefined ? <CaretRight size={20} color={MUTED_TEXT} /> : trailing}
    </TouchableOpacity>
  );
}
