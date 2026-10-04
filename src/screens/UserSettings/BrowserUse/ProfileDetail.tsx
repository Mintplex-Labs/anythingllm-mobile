import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cookie, SignIn, Trash } from 'phosphor-react-native';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/utils/Notification';
import BrowserUse, { useBrowserUse } from '@/utils/BrowserUse';
import { BrowserNative, type BrowserProfile, type BrowserProfileSite } from '@/utils/BrowserUse/native';
import { COLORS, Header, SectionTitle, confirmDestructive, toastError } from './shared';

/**
 * One browser profile: sign in to a site in it, the sites that keep cookies (forget one), and
 * clearing or deleting the whole profile. Clearing and deleting wait while a session uses it.
 */
export default function ProfileDetail({ profileId, onBack }: { profileId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const hub = useBrowserUse();
  const [profile, setProfile] = useState<BrowserProfile | null>(null);
  const [sites, setSites] = useState<BrowserProfileSite[] | null>(null);
  /** The site whose cookie names are shown - one at a time */
  const [expanded, setExpanded] = useState<string | null>(null);
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
  const inUse = !!profile?.inUse;

  const forget = async (site: BrowserProfileSite) => {
    const confirmed = await confirmDestructive(t('settings.browser_use.forget_title', { site: site.host }), t('settings.browser_use.forget_message'), t('settings.browser_use.forget'));
    if (!confirmed) return;
    await BrowserNative.forgetSite(profileId, site.host).catch(() => { });
    load();
  };

  const clear = async () => {
    const confirmed = await confirmDestructive(t('settings.browser_use.clear_title', { name }), t('settings.browser_use.clear_message'), t('settings.browser_use.clear'));
    if (!confirmed) return;
    try {
      await BrowserNative.clearProfile(profileId);
      showToast(t('settings.browser_use.cleared_toast', { name }));
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    const confirmed = await confirmDestructive(t('settings.browser_use.delete_title', { name }), t('settings.browser_use.delete_message'), t('settings.browser_use.delete'));
    if (!confirmed) return;
    try {
      await BrowserNative.deleteProfile(profileId);
      onBack();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <Header title={name} onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <SignInBox profileId={profileId} />

        <SectionTitle title={t('settings.browser_use.sites')} />
        {sites === null && <ActivityIndicator color="#FFF" />}
        {sites?.length === 0 && (
          <View className="flex flex-col items-center rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 24, gap: 8 }}>
            <Cookie size={28} color={COLORS.muted} />
            <Text style={{ color: COLORS.muted }} className="text-sm text-center">{t('settings.browser_use.sites_empty')}</Text>
          </View>
        )}
        {(sites ?? []).map((site) => (
          <SiteRow
            key={site.host}
            site={site}
            expanded={expanded === site.host}
            onToggle={() => setExpanded((current) => (current === site.host ? null : site.host))}
            disabled={inUse}
            onForget={() => forget(site)}
          />
        ))}

        <SectionTitle title={t('settings.browser_use.manage')} />
        {inUse && <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.in_use')}</Text>}
        <View className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 6 }}>
          <TouchableOpacity onPress={clear} disabled={inUse} className="flex flex-row items-center" style={{ padding: 10, gap: 12, opacity: inUse ? 0.5 : 1 }}>
            <Cookie size={20} color={COLORS.danger} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: COLORS.danger }} className="text-base">{t('settings.browser_use.clear')}</Text>
              <Text style={{ color: COLORS.muted }} className="text-xs">{t('settings.browser_use.clear_description')}</Text>
            </View>
          </TouchableOpacity>
          {profile && !profile.isDefault && (
            <TouchableOpacity onPress={remove} disabled={inUse} className="flex flex-row items-center" style={{ padding: 10, gap: 12, opacity: inUse ? 0.5 : 1 }}>
              <Trash size={20} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="text-base">{t('settings.browser_use.delete')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </>
  );
}

/** Opens the profile's browser on a site, so the user can sign in before the agent needs it. */
function SignInBox({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  const signIn = async () => {
    try {
      await BrowserUse.openBrowser({ profileId, url });
      setUrl('');
    } catch (e) {
      if ((e as Error)?.message === 'invalid_url') showToast(t('settings.browser_use.invalid_url'));
      else toastError(e);
    }
  };

  return (
    <>
      <SectionTitle title={t('settings.browser_use.sign_in')} />
      <View className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 10 }}>
        <Text style={{ color: COLORS.muted }} className="text-sm">{t('settings.browser_use.sign_in_description')}</Text>
        <View className="flex flex-row items-center" style={{ gap: 8 }}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={signIn}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            placeholder={t('settings.browser_use.sign_in_placeholder')}
            placeholderTextColor="#71717A"
            style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: COLORS.input, color: '#FFF', paddingHorizontal: 12 }}
          />
          <TouchableOpacity onPress={signIn} disabled={!url.trim()} style={{ height: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#FFF', opacity: url.trim() ? 1 : 0.5, gap: 6 }} className="flex flex-row items-center justify-center">
            <SignIn size={16} color="#000" />
            <Text style={{ color: '#000' }} className="text-sm font-medium">{t('settings.browser_use.open')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

/** A site with cookies in the profile. Tap to see the cookie names; the bin forgets the site. */
function SiteRow({ site, expanded, onToggle, disabled, onForget }: { site: BrowserProfileSite; expanded: boolean; onToggle: () => void; disabled: boolean; onForget: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="rounded-lg" style={{ backgroundColor: COLORS.surface, padding: 12, gap: 8 }}>
      <View className="flex flex-row items-center" style={{ gap: 12 }}>
        <TouchableOpacity style={{ flex: 1, gap: 2 }} onPress={onToggle} disabled={!site.cookieCount}>
          <Text numberOfLines={1} className="text-white text-base">{site.host}</Text>
          <Text style={{ color: COLORS.muted }} className="text-xs">
            {`${t('settings.browser_use.cookie_count', { count: site.cookieCount })} · ${t('settings.browser_use.last_visited', { when: moment(site.lastVisited).fromNow() })}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onForget}
          disabled={disabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('settings.browser_use.forget_label', { site: site.host })}
          className="flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, backgroundColor: COLORS.dangerBackground, opacity: disabled ? 0.5 : 1 }}>
          <Trash size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
      {expanded && (
        <Text style={{ color: '#D4D4D8', fontFamily: 'monospace' }} className="text-xs">{site.cookies.join('\n')}</Text>
      )}
    </View>
  );
}
