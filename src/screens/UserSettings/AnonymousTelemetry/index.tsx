import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChartBar } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import { IWorkspacePageKey } from '../index';
import { useTranslation } from 'react-i18next';

interface AnonymousTelemetryProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

/**
 * Settings > Utility > Anonymous telemetry: a single toggle, on by default, for the anonymous usage
 * events we send to Firebase Analytics. Switching it off sends one final "disabled" event and then
 * every later event is dropped before it leaves the device.
 */
export default function AnonymousTelemetry({ goToPage }: AnonymousTelemetryProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const goBack = () => {
    goToPage('main');
    return true;
  };
  useHighjackBackButtonPress(goBack);

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col flex-1"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{ paddingTop: insets.top, paddingBottom: 20 }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity onPress={goBack} className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">{t('settings.utility.anonymous_telemetry')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20, gap: 24 }}>
        <TelemetrySetting />
      </ScrollView>
    </SafeView>
  );
}

function TelemetrySetting() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    Telemetry.isEnabled().then(setEnabled).catch(() => setEnabled(true));
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await Telemetry.setEnabled(next);
      showToast(next ? t('settings.telemetry.enabled_toast') : t('settings.telemetry.disabled_toast'));
    } catch (e) {
      console.error('[AnonymousTelemetry] could not update setting', e);
      setEnabled(!next);
      showToast(t('settings.update_failed'));
    }
  }

  return (
    <View className="w-full flex flex-col" style={{ gap: 12 }}>
      <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">{t('settings.telemetry.usage_data')}</Text>
      <View className="flex flex-col rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 12 }}>
        <View className="flex flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex flex-row items-center flex-1" style={{ gap: 10 }}>
            <ChartBar size={20} color="#FFF" />
            <Text className="text-white text-lg">{t('settings.telemetry.share_toggle')}</Text>
          </View>
          <ToggleSwitch isOn={enabled ?? true} onToggle={toggle} />
        </View>
      </View>
      <View className="flex flex-col" style={{ gap: 8 }}>
        <Text style={{ color: '#9F9FA0' }} className="text-sm">
          {t('settings.telemetry.description_events')}
        </Text>
        <Text style={{ color: '#9F9FA0' }} className="text-sm">
          {t('settings.telemetry.description_privacy')}
        </Text>
        <Text style={{ color: '#9F9FA0' }} className="text-sm">
          {t('settings.telemetry.description_opt_out')}
        </Text>
      </View>
    </View>
  );
}
