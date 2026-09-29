import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { CalendarBlank, ChatCircleText, Check, Copy, DownloadSimple, EnvelopeSimple, ShareNetwork } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { MenuRow, MUTED_TEXT, SHEET_BACKGROUND, SheetHeader } from '@/components/SheetMenu';
import uiStore from '@/store/UIStore';
import { hapticOptions } from '@/utils/clipboard';
import { showToast } from '@/utils/Notification';
import {
  getDraftApps,
  getPreferredApp,
  openDraftInApp,
  openEmailInApp,
  setPreferredApp,
  shareDraft,
  shareEmailDraft,
  type EmailDraft,
  type MessagingApp,
  type TextDraft,
} from '@/utils/messaging';
import {
  describeRecurrence,
  describeReminders,
  descriptionWithUrl,
  formatEventWhen,
  openCalendarEventInApp,
  saveEventAsIcs,
  shareEventAsIcs,
  type CalendarEvent,
} from '@/utils/calendar';

/** Lines of the body shown in the sheet - the app it opens in shows the rest */
const PREVIEW_LINES = 6;

type FocusedDraft =
  | { kind: 'text'; draft: TextDraft }
  | { kind: 'email'; draft: EmailDraft }
  | { kind: 'calendar'; draft: CalendarEvent };

/**
 * Mounted instances, newest last. Only the newest answers the event - a screen pushed on top
 * (eg: run detail over the chat) or the Quick Actions card - so two sheets never open at once.
 */
const mountedSheets: symbol[] = [];

/** Opens the draft sheet for a text draft card (see DraftCards) */
export function focusTextDraft(draft: TextDraft) {
  uiStore.emitter.emit(uiStore.globalEvents.DRAFT_FOCUSED, { kind: 'text', draft } satisfies FocusedDraft);
}

/** Opens the draft sheet for an email draft card (see DraftCards) */
export function focusEmailDraft(draft: EmailDraft) {
  uiStore.emitter.emit(uiStore.globalEvents.DRAFT_FOCUSED, { kind: 'email', draft } satisfies FocusedDraft);
}

/** Opens the draft sheet for a calendar event card (see DraftCards) */
export function focusCalendarEvent(draft: CalendarEvent) {
  uiStore.emitter.emit(uiStore.globalEvents.DRAFT_FOCUSED, { kind: 'calendar', draft } satisfies FocusedDraft);
}

/**
 * Picks which app a drafted text (messaging apps), email (mail apps) or event (calendar apps)
 * opens in. Lives at the screen level like the citations sheet, rather than inside the virtualized
 * chat row whose card triggered it. Picking an app opens the draft there and remembers it per kind,
 * so it is listed first next time. Events can also be saved as an .ics file instead of copied, which
 * is the way out on a phone with no calendar app.
 *
 * Mounted by the chat screen, the Quick Actions card and the scheduled job run detail. Only the
 * newest instance answers (see `mountedSheets`) and it re-registers its ref before presenting,
 * since the sheet registry holds one ref per sheet name.
 */
export default function DraftSheet() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const [focused, setFocused] = useState<FocusedDraft | null>(null);
  const [apps, setApps] = useState<MessagingApp[] | null>(null);
  const [preferredPackage, setPreferredPackage] = useState<string | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />,
    [],
  );

  useEffect(() => {
    const id = Symbol('DraftSheet');
    mountedSheets.push(id);
    const subscription = uiStore.emitter.addListener(uiStore.globalEvents.DRAFT_FOCUSED, (next: FocusedDraft) => {
      if (!next?.draft || mountedSheets[mountedSheets.length - 1] !== id) return;
      setFocused(next);
      setApps(null);
      Promise.all([getDraftApps(next.kind, { refresh: true }), getPreferredApp(next.kind)]).then(([installed, packageName]) => {
        // Last used app first, the rest keep the native order.
        setApps([...installed].sort((a, b) => Number(b.packageName === packageName) - Number(a.packageName === packageName)));
        setPreferredPackage(packageName);
      });
      registerSheet(BOTTOM_SHEET_NAMES.DRAFT, sheetRef);
      presentSheet(BOTTOM_SHEET_NAMES.DRAFT, true);
    });
    return () => {
      subscription.remove();
      mountedSheets.splice(mountedSheets.indexOf(id), 1);
    };
  }, [registerSheet, presentSheet]);

  const dismiss = () => dismissSheet(BOTTOM_SHEET_NAMES.DRAFT);
  const isEmail = focused?.kind === 'email';
  const isCalendar = focused?.kind === 'calendar';

  async function pick(app: MessagingApp) {
    if (!focused) return;
    try {
      if (focused.kind === 'email') await openEmailInApp(app.packageName, focused.draft);
      else if (focused.kind === 'calendar') await openCalendarEventInApp(app.packageName, focused.draft);
      else await openDraftInApp(app.packageName, focused.draft);
      await setPreferredApp(focused.kind, app.packageName);
      dismiss();
    } catch (error) {
      console.error('[DraftSheet] open failed', error);
      showToast(t('chat.draft.open_in_failed', { app: app.label }));
    }
  }

  async function share() {
    if (!focused) return;
    try {
      if (focused.kind === 'email') await shareEmailDraft(focused.draft, t('chat.email_draft.share_title'));
      else if (focused.kind === 'calendar') await shareEventAsIcs(focused.draft);
      else await shareDraft(focused.draft, t('chat.text_draft.share_title'));
      dismiss();
    } catch (error) {
      console.error('[DraftSheet] share failed', error);
      showToast(focused.kind === 'email'
        ? t('chat.email_draft.open_failed')
        : focused.kind === 'calendar' ? t('chat.calendar_event.open_failed') : t('chat.text_draft.open_failed'));
    }
  }

  function copy() {
    if (!focused || focused.kind === 'calendar') return;
    const { draft } = focused;
    Clipboard.setString('subject' in draft && draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body);
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    showToast(isEmail ? t('chat.email_draft.copied') : t('chat.text_draft.copied'));
    dismiss();
  }

  async function saveIcs() {
    if (focused?.kind !== 'calendar') return;
    try {
      const saved = await saveEventAsIcs(focused.draft);
      ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
      showToast(t('chat.file_download.saved_to', { filename: saved.filename, location: saved.locationLabel }));
      dismiss();
    } catch (error) {
      console.error('[DraftSheet] saving .ics failed', error);
      showToast(t('chat.calendar_event.save_failed'));
    }
  }

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
        <SheetHeader
          title={isCalendar ? t('chat.calendar_event.add_with') : t('chat.draft.send_with')}
          subtitle={focused ? recipientLine(focused, t) : undefined}
        />

        {focused?.kind === 'text' && (
          <PreviewBox
            body={focused.draft.body}
            hint={!focused.draft.phoneNumber ? t('chat.text_draft.no_number_hint') : null}
          />
        )}
        {focused?.kind === 'email' && (
          <PreviewBox
            subject={focused.draft.subject || t('chat.email_draft.no_subject')}
            meta={focused.draft.cc.length ? t('chat.email_draft.cc', { addresses: focused.draft.cc.join(', ') }) : null}
            body={focused.draft.body}
            hint={!focused.draft.to.length ? t('chat.email_draft.no_recipient_hint') : null}
          />
        )}
        {focused?.kind === 'calendar' && (
          <PreviewBox
            subject={focused.draft.title}
            meta={eventDetails(focused.draft, t)}
            body={descriptionWithUrl(focused.draft)}
            hint={apps?.length === 0
              ? t('chat.calendar_event.no_app_hint')
              // Android's new-event screen takes no reminders - only the .ics file keeps them.
              : focused.draft.reminderMinutes.length ? t('chat.calendar_event.reminders_hint') : null}
          />
        )}

        {apps === null ? (
          <ActivityIndicator color="#FFF" style={{ paddingVertical: 16 }} />
        ) : (
          apps.map(app => (
            <MenuRow
              key={app.packageName}
              icon={app.icon
                ? <Image source={{ uri: app.icon }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                : isEmail ? <EnvelopeSimple size={22} color="#FFF" />
                  : isCalendar ? <CalendarBlank size={22} color="#FFF" /> : <ChatCircleText size={22} color="#FFF" />}
              title={app.label}
              onPress={() => pick(app)}
              trailing={app.packageName === preferredPackage ? <Check size={20} color="#84CAFF" weight="bold" /> : null}
            />
          ))
        )}
        <MenuRow icon={<ShareNetwork size={22} color="#FFF" />} title={t('chat.draft.more_apps')} onPress={share} trailing={null} />
        {isCalendar ? (
          <MenuRow icon={<DownloadSimple size={22} color="#FFF" />} title={t('chat.calendar_event.save_ics')} onPress={saveIcs} trailing={null} />
        ) : (
          <MenuRow
            icon={<Copy size={22} color="#FFF" />}
            title={isEmail ? t('chat.email_draft.copy') : t('chat.text_draft.copy')}
            onPress={copy}
            trailing={null}
          />
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

/**
 * "Name · number" for texts, "Name · a@b.com, c@d.com" for emails, falling back to whichever is
 * known. For events, when it is.
 */
function recipientLine(focused: FocusedDraft, t: (key: string) => string): string {
  if (focused.kind === 'calendar') return formatEventWhen(focused.draft, t('chat.calendar_event.all_day'));
  const name = focused.draft.recipientName;
  const address = focused.kind === 'email'
    ? (focused.draft.to.length ? focused.draft.to.join(', ') : null)
    : focused.draft.phoneNumber;
  if (name && address) return `${name} · ${address}`;
  return name ?? address ?? (focused.kind === 'email' ? t('chat.email_draft.new_email') : t('chat.text_draft.new_message'));
}

/** The event's where / repeat / invitees / reminders, one line each, skipping what it does not have */
function eventDetails(event: CalendarEvent, t: (key: string, options?: Record<string, unknown>) => string): string[] {
  return [
    event.eventLocation,
    event.recurrence ? describeRecurrence(event.recurrence) : '',
    event.attendees.length ? t('chat.calendar_event.invitees', { addresses: event.attendees.join(', ') }) : '',
    describeReminders(event.reminderMinutes),
  ].filter(Boolean);
}

function PreviewBox({ subject, meta, body, hint }: { subject?: string; meta?: string | string[] | null; body: string; hint: string | null }) {
  const metaLines = (Array.isArray(meta) ? meta : [meta]).filter((line): line is string => !!line);
  return (
    <View style={{ backgroundColor: '#27272A', borderRadius: 12, padding: 12, marginBottom: 8, gap: 6 }}>
      {!!subject && <Text numberOfLines={2} style={{ color: '#FFF', fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{subject}</Text>}
      {metaLines.map(line => <Text key={line} numberOfLines={1} style={{ color: MUTED_TEXT, fontSize: 12, lineHeight: 17 }}>{line}</Text>)}
      {!!body && <Text numberOfLines={PREVIEW_LINES} style={{ color: '#FFF', fontSize: 14, lineHeight: 20 }}>{body}</Text>}
      {!!hint && <Text style={{ color: MUTED_TEXT, fontSize: 12, lineHeight: 17 }}>{hint}</Text>}
    </View>
  );
}
