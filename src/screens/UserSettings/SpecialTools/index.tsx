import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, TextAa } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import { isQuickContextAvailable, isQuickContextEnabled, setQuickContextEnabled } from '@/quickContext';
import { IWorkspacePageKey } from '../index';
import { useTranslation } from 'react-i18next';

interface SpecialToolsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

/**
 * Settings > Special tools: the system-level integrations that live outside the app's own screens.
 * Each one can be switched off here so it stops appearing in the OS. Today that is Context awareness,
 * the "Ask with AnythingLLM" entry in other apps' text-selection toolbars (Android).
 */
export default function SpecialTools({ goToPage }: SpecialToolsProps) {
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
        <Text className="text-white text-lg font-medium">{t('settings.special_tools.page_title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20, gap: 24 }}>
        <ContextAwarenessSetting />
      </ScrollView>
    </SafeView>
  );
}

/** The toggle for the selection-toolbar entry. Reflects the system's component state, not a stored copy. */
function ContextAwarenessSetting() {
  const { t } = useTranslation();
  const available = isQuickContextAvailable();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!available) return;
    isQuickContextEnabled().then(setEnabled).catch(() => setEnabled(true));
  }, [available]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await setQuickContextEnabled(next);
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.QUICK_CONTEXT_TOGGLED, { enabled: next });
      showToast(next ? t('settings.special_tools.added_toast') : t('settings.special_tools.removed_toast'));
    } catch (e) {
      console.error('[SpecialTools] could not toggle context awareness', e);
      setEnabled(!next);
      showToast(t('settings.update_failed'));
    }
  }

  return (
    <View className="w-full flex flex-col" style={{ gap: 12 }}>
      <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">{t('settings.special_tools.context_awareness')}</Text>
      <View className="flex flex-col rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 12 }}>
        <View className="flex flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex flex-row items-center flex-1" style={{ gap: 10 }}>
            <TextAa size={20} color="#FFF" />
            <Text className="text-white text-lg">{t('settings.special_tools.ask_with_anythingllm_toggle')}</Text>
          </View>
          {available ? (
            <ToggleSwitch isOn={enabled ?? true} onToggle={toggle} />
          ) : (
            <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.special_tools.android_only')}</Text>
          )}
        </View>
      </View>
      <Text style={{ color: '#9F9FA0' }} className="text-sm">
        {available
          ? t('settings.special_tools.description_available')
          : t('settings.special_tools.description_unavailable')}
      </Text>
    </View>
  );
}
