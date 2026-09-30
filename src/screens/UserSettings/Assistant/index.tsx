import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CaretDown, CaretRight, CheckCircle, Microphone, Screencast, Sparkle } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import {
  DEFAULT_ASSISTANT_THEME,
  getAssistantPreferences,
  getAssistantTheme,
  getAvailableAssistantThemes,
  isAssistantAvailable,
  isDefaultAssistant,
  openAssistantSettings,
  setAssistantPreference,
  setAssistantTheme,
  type AssistantPreferences,
  type AssistantThemeId,
} from '@/assistant';
import { tKey } from '@/i18n';
import { IWorkspacePageKey } from '../index';
import { useTranslation } from 'react-i18next';

/** How each background theme is labelled and hinted at in the picker (the themes themselves are native). */
const THEME_OPTIONS: Record<AssistantThemeId, { label: string; swatch: string[] }> = {
  rainbow: { label: tKey('settings.assistant.themes.rainbow'), swatch: ['#4285F4', '#EA4335', '#FBBC04', '#34A853'] },
  halftone: { label: tKey('settings.assistant.themes.halftone'), swatch: ['#2C2C2E', '#636366', '#AEAEB2', '#E5E5EA'] },
  terrain: { label: tKey('settings.assistant.themes.terrain'), swatch: ['#1C1C1E', '#48484A', '#8E8E93', '#FFFFFF'] },
  painterly: { label: tKey('settings.assistant.themes.painterly'), swatch: ['#5B7A8C', '#2F6BC6', '#B8C7D1', '#EEF2F5'] },
};

interface AssistantSettingsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

/**
 * Settings > Assistant: whether AnythingLLM is the device's default assistant app (and a way
 * into the Android settings where that is chosen - apps cannot claim the role themselves), plus how the
 * overlay behaves when it opens. The behaviors only show once AnythingLLM holds the role.
 */
export default function AssistantSettings({ goToPage }: AssistantSettingsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const available = isAssistantAvailable();
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const goBack = () => {
    goToPage('main');
    return true;
  };
  useHighjackBackButtonPress(goBack);

  const refresh = useCallback(() => {
    if (!available) return;
    isDefaultAssistant().then(setIsDefault).catch(() => setIsDefault(false));
  }, [available]);

  // The choice is made in Android's settings - check again whenever the user comes back from there.
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  async function openSettings() {
    const opened = await openAssistantSettings().catch(() => false);
    if (!opened) showToast(t('settings.assistant.open_settings_failed'));
  }

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
        <Text className="text-white text-lg font-medium">{t('settings.assistant.page_title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20, gap: 24 }}>
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">{t('settings.assistant.status_title')}</Text>
          <View className="flex flex-col rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 12 }}>
            <View className="flex flex-row items-center justify-between" style={{ gap: 12 }}>
              <View className="flex flex-row items-center flex-1" style={{ gap: 10 }}>
                {isDefault ? <CheckCircle size={20} color="#34A853" weight="fill" /> : <Sparkle size={20} color="#FFF" />}
                <Text className="text-white text-base flex-1">
                  {!available
                    ? t('settings.assistant.page_title')
                    : isDefault
                      ? t('settings.assistant.status_on')
                      : t('settings.assistant.status_off')}
                </Text>
              </View>
              {available ? (
                <TouchableOpacity
                  onPress={openSettings}
                  activeOpacity={0.7}
                  className={`rounded-full ${isDefault ? 'bg-white/10' : 'bg-white'}`}
                  style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text className={`text-sm font-medium ${isDefault ? 'text-white' : 'text-black'}`}>
                    {isDefault ? t('settings.assistant.change') : t('settings.assistant.set_up')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.special_tools.android_only')}</Text>
              )}
            </View>
            {available && isDefault === false && (
              <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.assistant.setup_steps')}</Text>
            )}
          </View>
          {available ? (
            <>
              <TouchableOpacity
                onPress={() => setShowHelp((value) => !value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: showHelp }}
                className="flex flex-row items-center self-start"
                style={{ gap: 4 }}>
                <Text style={{ color: '#9F9FA0' }} className="text-sm font-medium">{t('settings.assistant.need_help')}</Text>
                {showHelp ? <CaretDown size={14} color="#9F9FA0" /> : <CaretRight size={14} color="#9F9FA0" />}
              </TouchableOpacity>
              {showHelp && (
                <>
                  <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.assistant.description')}</Text>
                  {/* Circle to Search takes long-press home ahead of the default assistant - a common source of "it still opens Google". */}
                  <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.assistant.circle_to_search_note')}</Text>
                </>
              )}
            </>
          ) : (
            <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.assistant.description_unavailable')}</Text>
          )}
        </View>

        {available && isDefault && <AssistantBehavior />}
        {available && isDefault && <AssistantThemePicker />}
      </ScrollView>
    </SafeView>
  );
}

/** What the overlay does as soon as it opens. Stored in app storage and read by each invocation. */
function AssistantBehavior() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<AssistantPreferences | null>(null);

  useEffect(() => {
    getAssistantPreferences().then(setPreferences).catch(() => setPreferences({ autoListen: false, autoScreenshot: false }));
  }, []);

  async function toggle(preference: keyof AssistantPreferences) {
    if (!preferences) return;
    const next = !preferences[preference];
    setPreferences({ ...preferences, [preference]: next });
    try {
      await setAssistantPreference(preference, next);
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.ASSISTANT_PREFERENCE_TOGGLED, { preference, enabled: next });
    } catch (e) {
      console.error('[AssistantSettings] could not save preference', e);
      setPreferences((current) => current && { ...current, [preference]: !next });
      showToast(t('settings.update_failed'));
    }
  }

  return (
    <View className="w-full flex flex-col" style={{ gap: 12 }}>
      <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">{t('settings.assistant.behavior_title')}</Text>
      <View className="flex flex-col rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 14, gap: 18 }}>
        <BehaviorRow
          icon={<Microphone size={20} color="#FFF" />}
          label={t('settings.assistant.auto_listen')}
          description={t('settings.assistant.auto_listen_description')}
          isOn={!!preferences?.autoListen}
          onToggle={() => toggle('autoListen')}
        />
        <BehaviorRow
          icon={<Screencast size={20} color="#FFF" />}
          label={t('settings.assistant.auto_screenshot')}
          description={t('settings.assistant.auto_screenshot_description')}
          isOn={!!preferences?.autoScreenshot}
          onToggle={() => toggle('autoScreenshot')}
        />
      </View>
    </View>
  );
}

/** The animated background behind the overlay. Saved natively; applies from the next invocation (or right away). */
function AssistantThemePicker() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<AssistantThemeId | null>(null);
  const [themes, setThemes] = useState<AssistantThemeId[]>([DEFAULT_ASSISTANT_THEME]);

  useEffect(() => {
    getAssistantTheme().then(setTheme).catch(() => setTheme(DEFAULT_ASSISTANT_THEME));
    getAvailableAssistantThemes().then(setThemes).catch(() => null);
  }, []);

  async function pick(next: AssistantThemeId) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    try {
      setTheme(await setAssistantTheme(next));
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.ASSISTANT_THEME_CHANGED, { theme: next });
    } catch (e) {
      console.error('[AssistantSettings] could not save theme', e);
      setTheme(previous);
      showToast(t('settings.update_failed'));
    }
  }

  return (
    <View className="w-full flex flex-col" style={{ gap: 12 }}>
      <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">{t('settings.assistant.theme_title')}</Text>
      {/* Two per row */}
      <View className="flex flex-row flex-wrap" style={{ rowGap: 8, justifyContent: 'space-between' }}>
        {themes.map((id) => {
          const option = THEME_OPTIONS[id];
          const selected = id === theme;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => pick(id)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className="flex flex-col items-center rounded-lg"
              // The border is always there (transparent when unselected) so selecting never shifts the layout.
              style={{ width: '49%', backgroundColor: '#1B1B1E', paddingVertical: 14, gap: 10, borderWidth: 1.5, borderColor: selected ? '#FFF' : 'transparent' }}>
              <View className="flex flex-row">
                {option.swatch.map((color, index) => (
                  <View
                    key={color + index}
                    style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, marginLeft: index === 0 ? 0 : -6, borderWidth: 1.5, borderColor: '#1B1B1E' }}
                  />
                ))}
              </View>
              <Text className="text-white text-sm">{t(option.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: '#9F9FA0' }} className="text-sm">{t('settings.assistant.theme_description')}</Text>
    </View>
  );
}

function BehaviorRow({ icon, label, description, isOn, onToggle }: {
  icon: ReactNode;
  label: string;
  description: string;
  isOn: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="flex flex-col" style={{ gap: 6 }}>
      <View className="flex flex-row items-center justify-between" style={{ gap: 12 }}>
        <View className="flex flex-row items-center flex-1" style={{ gap: 10 }}>
          {icon}
          <Text className="text-white text-lg">{label}</Text>
        </View>
        <ToggleSwitch isOn={isOn} onToggle={onToggle} />
      </View>
      <Text style={{ color: '#9F9FA0' }} className="text-sm">{description}</Text>
    </View>
  );
}
