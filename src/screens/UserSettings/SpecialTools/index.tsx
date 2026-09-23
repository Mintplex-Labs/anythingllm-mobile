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

interface SpecialToolsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

/**
 * Settings > Special tools: the system-level integrations that live outside the app's own screens.
 * Each one can be switched off here so it stops appearing in the OS. Today that is Context awareness,
 * the "Ask with AnythingLLM" entry in other apps' text-selection toolbars (Android).
 */
export default function SpecialTools({ goToPage }: SpecialToolsProps) {
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
        <Text className="text-white text-lg font-medium">Special tools</Text>
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
      showToast(next ? 'Ask with AnythingLLM added to text selection menus' : 'Ask with AnythingLLM removed from text selection menus');
    } catch (e) {
      console.error('[SpecialTools] could not toggle context awareness', e);
      setEnabled(!next);
      showToast('Could not update the setting');
    }
  }

  return (
    <View className="w-full flex flex-col" style={{ gap: 12 }}>
      <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Context awareness</Text>
      <View className="flex flex-col rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 12 }}>
        <View className="flex flex-row items-center justify-between" style={{ gap: 12 }}>
          <View className="flex flex-row items-center flex-1" style={{ gap: 10 }}>
            <TextAa size={20} color="#FFF" />
            <Text className="text-white text-lg">Ask with AnythingLLM</Text>
          </View>
          {available ? (
            <ToggleSwitch isOn={enabled ?? true} onToggle={toggle} />
          ) : (
            <Text style={{ color: '#9F9FA0' }} className="text-sm">Android only</Text>
          )}
        </View>
      </View>
      <Text style={{ color: '#9F9FA0' }} className="text-sm">
        {available
          ? 'Adds "Ask with AnythingLLM" to the menu that appears when you select text in any app. Use it to polish, shorten or fix what you are writing, or to summarize, explain and research what you are reading - with whichever model you have selected here.'
          : 'On Android, AnythingLLM can appear in the menu that shows when you select text in any app, to edit or summarize it with your chosen model. iOS does not offer apps this hook.'}
      </Text>
    </View>
  );
}
