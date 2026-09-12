import { Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import { ArrowLeft, CaretRight } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Palette lifted from the Settings screens so the developer tools feel like the rest of the app.
export const DEV_COLORS = {
  background: '#0E0F0F',
  card: '#1B1B1E',
  divider: '#27282A',
  muted: '#9F9FA0',
  danger: '#F97066',
  dangerBg: 'rgba(122,39,26,0.2)',
  cta: '#84CAFF',
  input: '#000',
};

export function DevHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: 20 }}
      className="w-full flex flex-row items-center justify-center relative">
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        className="absolute left-0 flex flex-row items-center gap-2">
        <ArrowLeft size={24} color="#FFF" weight="bold" />
      </TouchableOpacity>
      <Text
        style={{ maxWidth: '70%' }}
        numberOfLines={1}
        ellipsizeMode="middle"
        className="text-white text-lg font-medium">
        {title}
      </Text>
      {right && <View className="absolute right-0">{right}</View>}
    </View>
  );
}

export function Section({
  title,
  description,
  right,
  children,
  style,
}: {
  title?: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View className="w-full flex flex-col" style={[{ gap: 12 }, style]}>
      {(title || right) && (
        <View className="flex flex-row items-end justify-between">
          <Text style={{ color: DEV_COLORS.muted }} className="text-sm uppercase">
            {title}
          </Text>
          {right}
        </View>
      )}
      {children}
      {description && (
        <Text style={{ color: DEV_COLORS.muted }} className="text-sm">
          {description}
        </Text>
      )}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className="flex flex-col"
      style={[
        { backgroundColor: DEV_COLORS.card, padding: 14, gap: 12, borderRadius: 8 },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  right,
  caret = true,
  danger = false,
  borderBottom = true,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  caret?: boolean;
  danger?: boolean;
  borderBottom?: boolean;
  onPress?: () => void;
}) {
  const color = danger ? DEV_COLORS.danger : '#FFF';
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      className="flex flex-row items-center"
      style={{
        gap: 12,
        borderBottomWidth: borderBottom ? 1 : 0,
        borderBottomColor: DEV_COLORS.divider,
        paddingBottom: borderBottom ? 12 : 0,
      }}>
      {icon}
      <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
        <Text numberOfLines={1} style={{ color }} className="text-lg">
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={2} style={{ color: DEV_COLORS.muted }} className="text-sm">
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {caret && onPress && <CaretRight size={18} color={danger ? DEV_COLORS.danger : '#FFF'} />}
    </TouchableOpacity>
  );
}

export function Pill({ label }: { label: string | number }) {
  return (
    <View
      style={{ backgroundColor: DEV_COLORS.divider, paddingHorizontal: 10, paddingVertical: 3 }}
      className="rounded-full">
      <Text style={{ color: DEV_COLORS.muted }} className="text-sm font-medium">
        {label}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      className="flex flex-row items-center justify-center rounded-lg"
      style={[
        {
          backgroundColor: primary ? DEV_COLORS.cta : DEV_COLORS.divider,
          padding: 14,
          gap: 8,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      {icon}
      <Text
        style={{ color: primary ? DEV_COLORS.background : '#FFF' }}
        className="text-base font-medium">
        {label}
      </Text>
    </TouchableOpacity>
  );
}
