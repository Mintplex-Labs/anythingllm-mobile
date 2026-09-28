import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ChatCircleText, Check, Copy, ShareNetwork } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { MenuRow, MUTED_TEXT, SHEET_BACKGROUND, SheetHeader } from '@/components/SheetMenu';
import uiStore from '@/store/UIStore';
import { hapticOptions } from '@/utils/clipboard';
import { showToast } from '@/utils/Notification';
import {
  getMessagingApps,
  getPreferredApp,
  openDraftInApp,
  setPreferredApp,
  shareDraft,
  type MessagingApp,
  type TextDraft,
} from '@/utils/messaging';

/** Lines of the message shown in the sheet - the messaging app shows the rest */
const PREVIEW_LINES = 6;

/**
 * Mounted instances, newest last. Only the newest answers the event - a screen pushed on top
 * (eg: run detail over the chat) or the Quick Actions card - so two sheets never open at once.
 */
const mountedSheets: symbol[] = [];

/** Opens the text draft sheet for a draft card (see TextDraftCard) */
export function focusTextDraft(draft: TextDraft) {
  uiStore.emitter.emit(uiStore.globalEvents.TEXT_DRAFT_FOCUSED, draft);
}

/**
 * Picks which messaging app a drafted text opens in. Lives at the screen level like the
 * citations sheet, rather than inside the virtualized chat row whose card triggered it.
 * Picking an app opens the draft there and remembers it, so it is listed first next time.
 *
 * Mounted by the chat screen, the Quick Actions card and the scheduled job run detail. Only the
 * newest instance answers (see `mountedSheets`) and it re-registers its ref before presenting,
 * since the sheet registry holds one ref per sheet name.
 */
export default function TextDraftSheet() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [apps, setApps] = useState<MessagingApp[] | null>(null);
  const [preferredPackage, setPreferredPackage] = useState<string | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />,
    [],
  );

  useEffect(() => {
    const id = Symbol('TextDraftSheet');
    mountedSheets.push(id);
    const subscription = uiStore.emitter.addListener(uiStore.globalEvents.TEXT_DRAFT_FOCUSED, (focused: TextDraft) => {
      if (!focused?.body || mountedSheets[mountedSheets.length - 1] !== id) return;
      setDraft(focused);
      setApps(null);
      Promise.all([getMessagingApps({ refresh: true }), getPreferredApp()]).then(([installed, packageName]) => {
        // Last used app first, the rest keep the native order (default SMS app, then chat apps).
        setApps([...installed].sort((a, b) => Number(b.packageName === packageName) - Number(a.packageName === packageName)));
        setPreferredPackage(packageName);
      });
      registerSheet(BOTTOM_SHEET_NAMES.TEXT_DRAFT, sheetRef);
      presentSheet(BOTTOM_SHEET_NAMES.TEXT_DRAFT, true);
    });
    return () => {
      subscription.remove();
      mountedSheets.splice(mountedSheets.indexOf(id), 1);
    };
  }, [registerSheet, presentSheet]);

  const dismiss = () => dismissSheet(BOTTOM_SHEET_NAMES.TEXT_DRAFT);

  async function pick(app: MessagingApp) {
    if (!draft) return;
    try {
      await openDraftInApp(app.packageName, draft);
      await setPreferredApp(app.packageName);
      dismiss();
    } catch (error) {
      console.error('[TextDraftSheet] open failed', error);
      showToast(t('chat.text_draft.open_in_failed', { app: app.label }));
    }
  }

  async function share() {
    if (!draft) return;
    try {
      await shareDraft(draft, t('chat.text_draft.share_title'));
      dismiss();
    } catch (error) {
      console.error('[TextDraftSheet] share failed', error);
      showToast(t('chat.text_draft.open_failed'));
    }
  }

  function copy() {
    if (!draft) return;
    Clipboard.setString(draft.body);
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    showToast(t('chat.text_draft.copied'));
    dismiss();
  }

  const recipient = draft?.recipientName && draft?.phoneNumber
    ? `${draft.recipientName} · ${draft.phoneNumber}`
    : draft?.recipientName ?? draft?.phoneNumber ?? t('chat.text_draft.new_message');

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: SHEET_BACKGROUND }}
      handleIndicatorStyle={{ backgroundColor: MUTED_TEXT, width: 45, margin: 10 }}
      onDismiss={dismiss}>
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        <SheetHeader title={t('chat.text_draft.send_with')} subtitle={recipient} />

        {!!draft && (
          <View style={{ backgroundColor: '#27272A', borderRadius: 12, padding: 12, marginBottom: 8, gap: 6 }}>
            <Text numberOfLines={PREVIEW_LINES} style={{ color: '#FFF', fontSize: 14, lineHeight: 20 }}>{draft.body}</Text>
            {!draft.phoneNumber && <Text style={{ color: MUTED_TEXT, fontSize: 12, lineHeight: 17 }}>{t('chat.text_draft.no_number_hint')}</Text>}
          </View>
        )}

        {apps === null ? (
          <ActivityIndicator color="#FFF" style={{ paddingVertical: 16 }} />
        ) : (
          apps.map(app => (
            <MenuRow
              key={app.packageName}
              icon={app.icon
                ? <Image source={{ uri: app.icon }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                : <ChatCircleText size={22} color="#FFF" />}
              title={app.label}
              onPress={() => pick(app)}
              trailing={app.packageName === preferredPackage ? <Check size={20} color="#84CAFF" weight="bold" /> : null}
            />
          ))
        )}
        <MenuRow icon={<ShareNetwork size={22} color="#FFF" />} title={t('chat.text_draft.more_apps')} onPress={share} trailing={null} />
        <MenuRow icon={<Copy size={22} color="#FFF" />} title={t('chat.text_draft.copy')} onPress={copy} trailing={null} />
      </BottomSheetView>
    </BottomSheetModal>
  );
}
