import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Browser, CaretRight, ClockCounterClockwise, Plus, UserCircle } from 'phosphor-react-native';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { useBrowserCapabilities } from '@/utils/BrowserUse';
import { BrowserNative, hasNativeBrowser, type BrowserProfile } from '@/utils/BrowserUse/native';
import BrowserTraces, { type BrowserTraceSummary } from '@/utils/BrowserUse/traces';
import { BROWSER_STATUS_COLORS, useBrowserStatusLabel } from '@/components/BrowserUseTrace';
import { COLORS, Header, SectionTitle, confirmDestructive, toastError } from './shared';

/** Browser use settings, first page: the profiles and the history of every session. */
export default function Home({ onBack, openProfile, openTrace }: { onBack: () => void; openProfile: (id: string) => void; openTrace: (id: string) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null);
  const [traces, setTraces] = useState<BrowserTraceSummary[] | null>(null);

  const load = useCallback(() => {
    if (hasNativeBrowser) BrowserNative.profiles().then(setProfiles).catch(() => setProfiles([]));
    else setProfiles([]);
    BrowserTraces.list().then(setTraces).catch(() => setTraces([]));
  }, []);
  useEffect(load, [load]);

  const clearHistory = async () => {
    const confirmed = await confirmDestructive(
      t('settings.browser_use.clear_history_title'),
      t('settings.browser_use.clear_history_message'),
      t('settings.browser_use.clear_history_confirm'),
    );
    if (!confirmed) return;
    await BrowserTraces.deleteAll().catch(() => { });
    setTraces([]);
  };

  return (
    <>
      <Header title={t('settings.browser_use.title')} onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <Text style={{ color: COLORS.muted }} className="text-sm">{t('settings.browser_use.description')}</Text>
        {hasNativeBrowser
          ? <Profiles profiles={profiles} onChanged={load} openProfile={openProfile} />
          : <Text style={{ color: COLORS.muted }} className="text-sm">{t('settings.browser_use.unsupported')}</Text>}

        <SectionTitle
          title={t('settings.browser_use.history')}
          right={traces?.length ? (
            <TouchableOpacity onPress={clearHistory} hitSlop={8}>
              <Text style={{ color: COLORS.danger }} className="text-sm">{t('settings.browser_use.clear_history')}</Text>
            </TouchableOpacity>
          ) : null}
        />
        {traces === null && <ActivityIndicator color="#FFF" />}
        {traces?.length === 0 && (
          <View className="flex flex-col items-center rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 24, gap: 8 }}>
            <ClockCounterClockwise size={28} color={COLORS.muted} />
            <Text className="text-white text-base font-medium text-center">{t('settings.browser_use.history_empty_title')}</Text>
            <Text style={{ color: COLORS.muted }} className="text-sm text-center">{t('settings.browser_use.history_empty_description')}</Text>
          </View>
        )}
        {(traces ?? []).map((trace) => <TraceRow key={trace.id} trace={trace} onPress={() => openTrace(trace.id)} />)}
      </ScrollView>
    </>
  );
}

/** The profile list, with "New profile" when the WebView supports more than one. */
function Profiles({ profiles, onChanged, openProfile }: { profiles: BrowserProfile[] | null; onChanged: () => void; openProfile: (id: string) => void }) {
  const { t } = useTranslation();
  const capabilities = useBrowserCapabilities();
  const [newProfileName, setNewProfileName] = useState<string | null>(null);

  const createProfile = async () => {
    const name = (newProfileName || '').trim();
    if (!name) return setNewProfileName(null);
    try {
      await BrowserNative.createProfile(name);
      setNewProfileName(null);
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <SectionTitle
        title={t('settings.browser_use.profiles')}
        right={capabilities?.multiProfile && newProfileName === null ? (
          <TouchableOpacity onPress={() => setNewProfileName('')} hitSlop={8} className="flex flex-row items-center" style={{ gap: 4 }}>
            <Plus size={14} color={COLORS.accent} weight="bold" />
            <Text style={{ color: COLORS.accent }} className="text-sm">{t('settings.browser_use.new_profile')}</Text>
          </TouchableOpacity>
        ) : null}
      />
      <View className="flex flex-col rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 6 }}>
        {profiles === null && <ActivityIndicator style={{ margin: 12 }} color="#FFF" />}
        {(profiles ?? []).map((profile) => (
          <TouchableOpacity key={profile.id} onPress={() => openProfile(profile.id)} className="flex flex-row items-center" style={{ padding: 10, gap: 12 }}>
            <UserCircle size={20} color="#FFF" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} className="text-white text-base">{profile.isDefault ? t('settings.browser_use.default_profile') : profile.name}</Text>
              <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.site_count', { count: profile.siteCount })}</Text>
            </View>
            <CaretRight size={16} color={COLORS.muted} />
          </TouchableOpacity>
        ))}
        {newProfileName !== null && (
          <View className="flex flex-row items-center" style={{ padding: 6, gap: 8 }}>
            <TextInput
              autoFocus
              value={newProfileName}
              onChangeText={setNewProfileName}
              onSubmitEditing={createProfile}
              placeholder={t('settings.browser_use.new_profile_placeholder')}
              placeholderTextColor="#71717A"
              maxLength={40}
              style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: COLORS.input, color: '#FFF', paddingHorizontal: 12 }}
            />
            <TouchableOpacity onPress={createProfile} style={{ height: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#FFF' }} className="flex items-center justify-center">
              <Text style={{ color: '#000' }} className="text-sm font-medium">{t('settings.browser_use.create')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {capabilities && !capabilities.multiProfile && (
        <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.single_profile_note')}</Text>
      )}
    </>
  );
}

function TraceRow({ trace, onPress }: { trace: BrowserTraceSummary; onPress: () => void }) {
  const { t } = useTranslation();
  const statusLabel = useBrowserStatusLabel();
  return (
    <TouchableOpacity onPress={onPress} className="flex flex-row items-center rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 12 }}>
      <Browser size={20} color="#FFF" />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} className="text-white text-sm">{trace.task}</Text>
        <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">
          <Text style={{ color: BROWSER_STATUS_COLORS[trace.status] }}>{statusLabel(trace.status)}</Text>
          {` · ${moment(trace.startedAt).fromNow()} · ${t('browser_use.trace.steps', { count: trace.stepCount })}`}
        </Text>
        {trace.sites.length > 0 && (
          <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">{trace.sites.map((site) => site.host.replace(/^www\./, '')).join(', ')}</Text>
        )}
      </View>
      <CaretRight size={16} color={COLORS.muted} />
    </TouchableOpacity>
  );
}
