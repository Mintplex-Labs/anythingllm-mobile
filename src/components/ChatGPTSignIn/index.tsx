import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import uiStore from '@/store/UIStore';
import chatgptAuth, { CHATGPT_MANAGE_USAGE_URL, ChatGPTAuthError } from '@/utils/chatgpt/auth';

/** The user closed the browser - never shown. A Cancel on OpenAI's consent screen (`denied`) is, since an
 * ineligible plan leaves Cancel as the only way out of that screen. */
const SILENT_ERRORS = ['cancelled'];

/**
 * First sign-in disclosure required by the Sign in with ChatGPT UI guidelines: requests use the plan and
 * usage is managed in ChatGPT's settings. Resolves false when the user backs out.
 */
async function confirmPlanUsage(t: (key: string) => string): Promise<boolean> {
  const seen = await uiStore.getFromStorage('chatgpt_plan_notice_seen', false);
  if (seen) return true;
  return new Promise(resolve => {
    Alert.alert(
      t('providers.chatgpt.notice_title'),
      t('providers.chatgpt.notice_body'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('providers.chatgpt.notice_confirm'),
          onPress: async () => {
            await uiStore.setToStorage('chatgpt_plan_notice_seen', true);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * "Continue with ChatGPT" button, or the signed-in account with Manage usage / Sign out once connected.
 * The keychain is the source of truth for whether we are signed in - `config.account` can outlive a
 * session that ended (refresh token expired or revoked), in which case the button shows again.
 */
export default function ChatGPTSignIn({
  onSignedIn,
  onSignedOut,
}: {
  onSignedIn: (email: string) => void | Promise<void>;
  onSignedOut: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatgptAuth.getAccount().then(found => setAccount(found ? found.email : null));
  }, []);

  const signIn = async () => {
    setError(null);
    if (!(await confirmPlanUsage(t))) return;
    setBusy(true);
    try {
      const { email } = await chatgptAuth.signIn();
      setAccount(email);
      await onSignedIn(email);
    } catch (e: any) {
      const code = e instanceof ChatGPTAuthError ? e.code : null;
      if (code && SILENT_ERRORS.includes(code)) return;
      if (code === 'plan_usage_not_granted') setError(t('providers.chatgpt.plan_usage_not_granted'));
      else if (code === 'not_eligible') setError(t('providers.chatgpt.errors.not_eligible'));
      else if (code === 'denied') setError(t('providers.chatgpt.denied'));
      else setError(t('providers.chatgpt.sign_in_failed', { error: e?.message ?? String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await chatgptAuth.signOut();
      setAccount(null);
      await onSignedOut();
    } finally {
      setBusy(false);
    }
  };

  if (account === undefined) return <ActivityIndicator size="small" color="white" />;

  if (!account) {
    return (
      <View style={{ gap: 10 }}>
        <TouchableOpacity
          disabled={busy}
          onPress={signIn}
          accessibilityRole="button"
          className="flex flex-row items-center justify-center rounded-lg bg-white"
          style={{ height: 48, gap: 10, opacity: busy ? 0.7 : 1 }}>
          {busy
            ? <ActivityIndicator size="small" color="#0E0F0F" />
            : <Image source={require('@/assets/llmprovider/openai.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />}
          <Text className="text-[#0E0F0F] text-base font-semibold">{t('providers.chatgpt.continue')}</Text>
        </TouchableOpacity>
        <Text className="text-[#9F9FA0] text-sm">{t('providers.chatgpt.plan_hint')}</Text>
        <Text className="text-[#F59E0B] text-sm">{t('providers.chatgpt.experimental_note')}</Text>
        {!!error && <Text className="text-[#f87171] text-sm">{error}</Text>}
      </View>
    );
  }

  return (
    <View className="rounded-lg bg-[#27282A]" style={{ padding: 14, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text className="text-white text-base font-semibold" numberOfLines={1}>
          {t('providers.chatgpt.signed_in_as', { email: account || t('providers.chatgpt.your_account') })}
        </Text>
        <Text className="text-[#9F9FA0] text-sm">{t('providers.chatgpt.using_plan')}</Text>
      </View>
      <View className="flex flex-row" style={{ gap: 20 }}>
        <TouchableOpacity onPress={() => Linking.openURL(CHATGPT_MANAGE_USAGE_URL)} hitSlop={8}>
          <Text className="text-[#7cd4fd] text-sm font-semibold">{t('providers.chatgpt.manage_usage')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={signOut} disabled={busy} hitSlop={8}>
          <Text className="text-[#f87171] text-sm font-semibold">{t('providers.chatgpt.sign_out')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
