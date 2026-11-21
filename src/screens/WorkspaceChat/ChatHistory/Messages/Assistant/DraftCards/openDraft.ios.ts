import { Linking } from "react-native";
import RNCalendarEvents, { type CalendarEventWritable } from "react-native-calendar-events";
import i18n from "@/i18n";
import { showToast } from "@/utils/Notification";
import { shareDraft, shareEmailDraft, type EmailDraft, type TextDraft } from "@/utils/messaging";
import { descriptionWithUrl, ensureCalendarPermission, type CalendarEvent } from "@/utils/calendar";
import { viewCalendarEvent } from "@/utils/calendarView";

/**
 * What tapping a draft card does on iOS, which cannot list installed apps: texts go to the share
 * sheet, emails to the default mail app, and events are saved straight to Calendar.
 * @see openDraft.ts
 */

/** Calendar ids of the events saved since the app started */
const savedEventIds = new Map<string, string>();

export function openTextDraft(draft: TextDraft) {
    shareDraft(draft).catch(() => showToast(i18n.t('chat.text_draft.open_failed')));
}

export function openEmailDraft(draft: EmailDraft) {
    // No mail app installed - the share sheet still lets the user send it from another app.
    Linking.openURL(emailDraftLink(draft))
        .catch(() => shareEmailDraft(draft))
        .catch(() => showToast(i18n.t('chat.email_draft.open_failed')));
}

export function addCalendarEvent(event: CalendarEvent) {
    // Tapping the card again shows the event in Calendar instead of saving a second copy.
    const key = `${event.title}|${event.beginTime}`;
    const savedId = savedEventIds.get(key);
    if (savedId) {
        viewCalendarEvent({ id: savedId, beginTime: event.beginTime, endTime: event.endTime }).catch(() => showToast(i18n.t('chat.calendar_event.open_failed')));
        return;
    }
    saveToCalendar(event)
        .then((id) => {
            savedEventIds.set(key, id);
            showToast(i18n.t('chat.calendar_event.saved'));
        })
        .catch((error: unknown) => {
            console.error('[CalendarEventCard] add failed', error);
            showToast(error instanceof Error && error.message === 'calendar_permission_denied'
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

/**
 * Saves the event with EventKit, which needs write access, and returns its id. Throws `calendar_permission_denied` when
 * access is refused. iOS apps cannot add invitees, and weekly repeats fall on the start's weekday.
 */
async function saveToCalendar(event: CalendarEvent): Promise<string> {
    if (!(await ensureCalendarPermission(false))) throw new Error('calendar_permission_denied');
    const recurrence = event.recurrence;
    return RNCalendarEvents.saveEvent(event.title, {
        startDate: new Date(event.beginTime).toISOString(),
        endDate: new Date(event.endTime).toISOString(),
        allDay: event.allDay,
        location: event.eventLocation || undefined,
        notes: descriptionWithUrl(event) || undefined,
        url: event.url ?? undefined,
        // A number is a relative offset in minutes from the start - negative is before.
        alarms: event.reminderMinutes.length ? event.reminderMinutes.map(minutes => ({ date: -minutes })) : undefined,
        // The library types every field as required, but it only applies the ones that are set.
        recurrenceRule: recurrence ? ({
            frequency: recurrence.frequency,
            interval: recurrence.interval,
            ...(recurrence.until !== null ? { endDate: new Date(recurrence.until).toISOString() } : {}),
            ...(recurrence.count !== null ? { occurrence: recurrence.count } : {}),
        } as CalendarEventWritable['recurrenceRule']) : undefined,
    });
}
