import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'phosphor-react-native';
import i18n from '@/i18n';
import AwaitableAlert from '@/components/AwaitableAlert';
import { showToast } from '@/utils/Notification';

/** Pieces shared by the Browser use settings pages. */

export const COLORS = {
  surface: '#1B1B1E',
  muted: '#9F9FA0',
  danger: '#F97066',
  dangerBackground: 'rgba(122,39,26,0.2)',
  input: '#0E0F0F',
  accent: '#84CAFF',
} as const;

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex flex-row items-center justify-center relative">
      <TouchableOpacity onPress={onBack} className="absolute left-0 flex flex-row items-center gap-2">
        <ArrowLeft size={24} color="#FFF" weight="bold" />
      </TouchableOpacity>
      <Text numberOfLines={1} className="text-white text-lg font-medium" style={{ maxWidth: '75%' }}>{title}</Text>
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View className="flex flex-row items-end justify-between" style={{ marginTop: 8 }}>
      <Text style={{ color: COLORS.muted }} className="text-sm uppercase">{title}</Text>
      {right}
    </View>
  );
}

/** A Cancel / destructive-action dialog. Resolves whether the user confirmed. */
export function confirmDestructive(title: string, message: string, confirmLabel: string) {
  return AwaitableAlert(title, message, { text: i18n.t('common.cancel'), style: 'cancel' }, { text: confirmLabel, style: 'destructive' });
}

/** Shows what went wrong, or the generic "update failed". */
export function toastError(error: unknown) {
  showToast((error as Error)?.message || i18n.t('settings.update_failed'));
}
