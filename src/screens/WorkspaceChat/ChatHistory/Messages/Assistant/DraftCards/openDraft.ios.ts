import { Linking, NativeModules } from "react-native";
import i18n from "@/i18n";
import { showToast } from "@/utils/Notification";
import { shareDraft, shareEmailDraft, type EmailDraft, type TextDraft } from "@/utils/messaging";
import { descriptionWithUrl, type CalendarEvent } from "@/utils/calendar";
import { viewCalendarEvent } from "@/utils/calendarView";

const { ComposeModule } = NativeModules;

/**
 * What tapping a draft card does on iOS, which cannot list installed apps: each draft opens in the
 * system's own compose sheet over the chat - Messages, Mail or Calendar's new event editor - filled
 * in and left for the user to send or add.
 * @see openDraft.ts
 */

/** When each event added since the app started begins, in epoch millis - the user may have moved it in the editor */
const addedEventStarts = new Map<string, number>();

export function openTextDraft(draft: TextDraft) {
    // No Messages on this device - the share sheet still lets the user send it from another app.
    ComposeModule.composeText(draft.phoneNumber ?? '', draft.body)
        .catch(() => shareDraft(draft))
        .catch(() => showToast(i18n.t('chat.text_draft.open_failed')));
}

export function openEmailDraft(draft: EmailDraft) {
    // No account in Mail - the default mail app takes the link, and without one the share sheet is left.
    ComposeModule.composeEmail(draft.to, draft.cc, draft.subject, draft.body)
        .catch(() => Linking.openURL(emailDraftLink(draft)))
        .catch(() => shareEmailDraft(draft))
        .catch(() => showToast(i18n.t('chat.email_draft.open_failed')));
}

export function addCalendarEvent(event: CalendarEvent) {
    // Tapping the card again shows the event in Calendar instead of adding a second copy.
    const key = `${event.title}|${event.beginTime}`;
    const addedStart = addedEventStarts.get(key);
    if (addedStart !== undefined) {
        viewCalendarEvent({ id: key, beginTime: addedStart, endTime: addedStart }).catch(() => showToast(i18n.t('chat.calendar_event.open_failed')));
        return;
    }
    // iOS apps cannot add invitees.
    ComposeModule.composeEvent({
        title: event.title,
        beginTime: event.beginTime,
        endTime: event.endTime,
        allDay: event.allDay,
        location: event.eventLocation || null,
        notes: descriptionWithUrl(event) || null,
        url: event.url ?? null,
        reminderMinutes: event.reminderMinutes,
        recurrence: event.recurrence,
    })
        .then((start: number | null) => {
            if (start !== null) addedEventStarts.set(key, start);
        })
        .catch((error: { code?: string }) => {
            showToast(error?.code === 'permission_denied'
                ? i18n.t('chat.calendar_event.permission_denied')
                : i18n.t('chat.calendar_event.open_failed'));
        });
}

/** `mailto:` link for the draft - the system opens it in the default mail app */
function emailDraftLink(draft: EmailDraft): string {
    const params = [
        draft.cc.length ? `cc=${encodeURIComponent(draft.cc.join(','))}` : null,
        `subject=${encodeURIComponent(draft.subject)}`,
        `body=${encodeURIComponent(draft.body)}`,
    ].filter(Boolean);
    return `mailto:${draft.to.map(encodeURIComponent).join(',')}?${params.join('&')}`;
}
