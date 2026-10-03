import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Browser, CaretRight, ClockCounterClockwise, Cookie, Plus, SignIn, Trash, UserCircle } from 'phosphor-react-native';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import SafeView from '@/components/SafeView';
import AwaitableAlert from '@/components/AwaitableAlert';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import BrowserUse, { useBrowserCapabilities, useBrowserUse } from '@/utils/BrowserUse';
import { BrowserNative, hasNativeBrowser, type BrowserProfile, type BrowserProfileSite } from '@/utils/BrowserUse/native';
import BrowserTraces, { type BrowserTraceSummary } from '@/utils/BrowserUse/traces';
import { BROWSER_STATUS_COLORS, BrowserTraceView, useBrowserStatusLabel } from '@/components/BrowserUseTrace';
import { IWorkspacePageKey } from '../index';

interface BrowserUseSettingsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

type View_ = { kind: 'home' } | { kind: 'profile'; profileId: string } | { kind: 'trace'; traceId: string };

const COLORS = {
  surface: '#1B1B1E',
  muted: '#9F9FA0',
  danger: '#F97066',
  dangerBackground: 'rgba(122,39,26,0.2)',
  input: '#0E0F0F',
  accent: '#84CAFF',
} as const;

/**
 * Settings > Utility > Browser use: everything the browser agent keeps on the phone - its
 * profiles (separate cookie jars), the sites each one is signed in to, and the history of every
 * session it ran. The mobile counterpart of the desktop Browser Use skill panel.
 */
export default function BrowserUseSettings({ goToPage }: BrowserUseSettingsProps) {
  const [view, setView] = useState<View_>({ kind: 'home' });
  const goBack = () => {
    if (view.kind !== 'home') setView({ kind: 'home' });
    else goToPage('main');
    return true;
  };
  // The hook registers once on mount - read the current sub-page through a ref.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useHighjackBackButtonPress(() => goBackRef.current());

  if (view.kind === 'trace') return <BrowserTraceView traceId={view.traceId} onBack={goBack} />;
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex flex-col flex-1" safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {view.kind === 'profile'
        ? <ProfileDetail profileId={view.profileId} onBack={goBack} />
        : <Home onBack={goBack} openProfile={(profileId) => setView({ kind: 'profile', profileId })} openTrace={(traceId) => setView({ kind: 'trace', traceId })} />}
    </SafeView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
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

function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View className="flex flex-row items-end justify-between" style={{ marginTop: 8 }}>
      <Text style={{ color: COLORS.muted }} className="text-sm uppercase">{title}</Text>
      {right}
    </View>
  );
}

/////////////////////////////
// Home: profiles + history
/////////////////////////////

function Home({ onBack, openProfile, openTrace }: { onBack: () => void; openProfile: (id: string) => void; openTrace: (id: string) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const capabilities = useBrowserCapabilities();
  const statusLabel = useBrowserStatusLabel();
  const [profiles, setProfiles] = useState<BrowserProfile[] | null>(null);
  const [traces, setTraces] = useState<BrowserTraceSummary[] | null>(null);
  const [newProfileName, setNewProfileName] = useState<string | null>(null);

  const load = useCallback(() => {
    if (hasNativeBrowser) BrowserNative.profiles().then(setProfiles).catch(() => setProfiles([]));
    else setProfiles([]);
    BrowserTraces.list().then(setTraces).catch(() => setTraces([]));
  }, []);
  useEffect(load, [load]);

  const createProfile = async () => {
    const name = (newProfileName || '').trim();
    if (!name) return setNewProfileName(null);
    try {
      await BrowserNative.createProfile(name);
      setNewProfileName(null);
      load();
    } catch (e) {
      showToast((e as Error)?.message || t('settings.update_failed'));
    }
  };

  const clearHistory = async () => {
    const confirmed = await AwaitableAlert(
      t('settings.browser_use.clear_history_title'),
      t('settings.browser_use.clear_history_message'),
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.browser_use.clear_history_confirm'), style: 'destructive' },
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
        {!hasNativeBrowser && <Text style={{ color: COLORS.muted }} className="text-sm">{t('settings.browser_use.unsupported')}</Text>}

        {hasNativeBrowser && (
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
        )}

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
        {(traces ?? []).map((trace) => (
          <TouchableOpacity key={trace.id} onPress={() => openTrace(trace.id)} className="flex flex-row items-center rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 12 }}>
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
        ))}
      </ScrollView>
    </>
  );
}

/////////////////////////////
// One profile: sign in, sites + cookies, clear / delete
/////////////////////////////

function ProfileDetail({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const hub = useBrowserUse();
  const [profile, setProfile] = useState<BrowserProfile | null>(null);
  const [sites, setSites] = useState<BrowserProfileSite[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [signInUrl, setSignInUrl] = useState('');
  const signInOpen = hub.viewerState?.mode === 'browse';

  const load = useCallback(() => {
    BrowserNative.profiles()
      .then((all) => setProfile(all.find((p) => p.id === profileId) ?? null))
      .catch(() => setProfile(null));
    BrowserNative.profileSites(profileId).then(setSites).catch(() => setSites([]));
  }, [profileId]);
  useEffect(load, [load]);
  // Coming back from signing in - show the new cookies.
  useEffect(() => { if (!signInOpen) load(); }, [signInOpen, load]);

  const name = profile ? (profile.isDefault ? t('settings.browser_use.default_profile') : profile.name) : '';

  const signIn = async () => {
    try {
      await BrowserUse.openBrowser({ profileId, url: signInUrl });
      setSignInUrl('');
    } catch (e) {
      showToast((e as Error)?.message === 'invalid_url' ? t('settings.browser_use.invalid_url') : (e as Error)?.message || t('settings.update_failed'));
    }
  };

  const forget = async (site: BrowserProfileSite) => {
    const confirmed = await AwaitableAlert(
      t('settings.browser_use.forget_title', { site: site.host }),
      t('settings.browser_use.forget_message'),
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.browser_use.forget'), style: 'destructive' },
    );
    if (!confirmed) return;
    await BrowserNative.forgetSite(profileId, site.host).catch(() => { });
    load();
  };

  const clear = async () => {
    const confirmed = await AwaitableAlert(
      t('settings.browser_use.clear_title', { name }),
      t('settings.browser_use.clear_message'),
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.browser_use.clear'), style: 'destructive' },
    );
    if (!confirmed) return;
    try {
      await BrowserNative.clearProfile(profileId);
      showToast(t('settings.browser_use.cleared_toast', { name }));
      load();
    } catch (e) {
      showToast((e as Error)?.message || t('settings.update_failed'));
    }
  };

  const remove = async () => {
    const confirmed = await AwaitableAlert(
      t('settings.browser_use.delete_title', { name }),
      t('settings.browser_use.delete_message'),
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.browser_use.delete'), style: 'destructive' },
    );
    if (!confirmed) return;
    try {
      await BrowserNative.deleteProfile(profileId);
      onBack();
    } catch (e) {
      showToast((e as Error)?.message || t('settings.update_failed'));
    }
  };

  return (
    <>
      <Header title={name} onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <SectionTitle title={t('settings.browser_use.sign_in')} />
        <View className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 10 }}>
          <Text style={{ color: COLORS.muted }} className="text-sm">{t('settings.browser_use.sign_in_description')}</Text>
          <View className="flex flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={signInUrl}
              onChangeText={setSignInUrl}
              onSubmitEditing={signIn}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              placeholder={t('settings.browser_use.sign_in_placeholder')}
              placeholderTextColor="#71717A"
              style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: COLORS.input, color: '#FFF', paddingHorizontal: 12 }}
            />
            <TouchableOpacity onPress={signIn} disabled={!signInUrl.trim()} style={{ height: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#FFF', opacity: signInUrl.trim() ? 1 : 0.5, gap: 6 }} className="flex flex-row items-center justify-center">
              <SignIn size={16} color="#000" />
              <Text style={{ color: '#000' }} className="text-sm font-medium">{t('settings.browser_use.open')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SectionTitle title={t('settings.browser_use.sites')} />
        {sites === null && <ActivityIndicator color="#FFF" />}
        {sites?.length === 0 && (
          <View className="flex flex-col items-center rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 24, gap: 8 }}>
            <Cookie size={28} color={COLORS.muted} />
            <Text style={{ color: COLORS.muted }} className="text-sm text-center">{t('settings.browser_use.sites_empty')}</Text>
          </View>
        )}
        {(sites ?? []).map((site) => (
          <View key={site.host} className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 8 }}>
            <View className="flex flex-row items-center" style={{ gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, gap: 2 }} onPress={() => setExpanded((current) => (current === site.host ? null : site.host))} disabled={!site.cookieCount}>
                <Text numberOfLines={1} className="text-white text-base">{site.host}</Text>
                <Text style={{ color: COLORS.muted }} className="text-xs">
                  {`${t('settings.browser_use.cookie_count', { count: site.cookieCount })} · ${t('settings.browser_use.last_visited', { when: moment(site.lastVisited).fromNow() })}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => forget(site)}
                disabled={!!profile?.inUse}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('settings.browser_use.forget_label', { site: site.host })}
                className="flex items-center justify-center rounded-lg"
                style={{ width: 36, height: 36, backgroundColor: COLORS.dangerBackground, opacity: profile?.inUse ? 0.5 : 1 }}>
                <Trash size={18} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
            {expanded === site.host && (
              <Text style={{ color: '#D4D4D8', fontFamily: 'monospace' }} className="text-xs">{site.cookies.join('\n')}</Text>
            )}
          </View>
        ))}

        <SectionTitle title={t('settings.browser_use.manage')} />
        {profile?.inUse && <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.in_use')}</Text>}
        <View className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 6 }}>
          <TouchableOpacity onPress={clear} disabled={!!profile?.inUse} className="flex flex-row items-center" style={{ padding: 10, gap: 12, opacity: profile?.inUse ? 0.5 : 1 }}>
            <Cookie size={20} color={COLORS.danger} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: COLORS.danger }} className="text-base">{t('settings.browser_use.clear')}</Text>
              <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.clear_description')}</Text>
            </View>
          </TouchableOpacity>
          {profile && !profile.isDefault && (
            <TouchableOpacity onPress={remove} disabled={profile.inUse} className="flex flex-row items-center" style={{ padding: 10, gap: 12, opacity: profile.inUse ? 0.5 : 1 }}>
              <Trash size={20} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="text-base">{t('settings.browser_use.delete')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </>
  );
}
