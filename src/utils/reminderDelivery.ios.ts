import notifee, { TriggerType } from '@notifee/react-native';
import { type IReminderAction } from '@/database/models/WorkspaceChat';
import PushNotifications from '@/utils/PushNotifications';
import { viewCalendarEvent } from '@/utils/calendarView';
import { CALENDAR_REMINDER_LENGTH_MS } from '@/utils/reminders';
import i18n from '@/i18n';

/**
 * Where reminders within a day go on iOS. Apps cannot set alarms or timers in the Clock app (that
 * needs AlarmKit, iOS 26+), so they are scheduled as local notifications, which iOS delivers even
 * when the app is closed. Reminders further out go to the calendar like on Android.
 * @see reminderDelivery.ts
 */

/** Where a reminder within a day ends up, for the model - English */
export const SHORT_REMINDER_PLACE = 'as a notification on the phone';

/** Translation keys for the copy that says where reminders go */
export const REMINDER_COPY_KEYS = {
    description: 'tools.set_reminder.description_ios',
    approvalCalendar: 'tools.set_reminder.approval_calendar_ios',
    openFailed: 'chat.reminder_card.open_calendar_failed',
} as const;

export async function setClockAlarm(fireAt: number, label: string): Promise<void> {
    await scheduleNotification(fireAt, label);
}

export async function setClockTimer(seconds: number, label: string): Promise<void> {
    await scheduleNotification(Date.now() + seconds * 1000, label);
}

/** Only calendar reminders live somewhere the card can open - a scheduled notification has no app */
export function canOpenReminder(kind: IReminderAction['action']['kind']): boolean {
    return kind === 'calendar';
}

/** Opens the calendar on the reminder's day. Throws when Calendar could not be opened. */
export async function openReminder(reminder: IReminderAction['action']): Promise<void> {
    if (reminder.kind !== 'calendar' || !reminder.eventId) throw new Error('missing_event');
    await viewCalendarEvent({ id: reminder.eventId, beginTime: reminder.fireAt, endTime: reminder.fireAt + CALENDAR_REMINDER_LENGTH_MS });
}

/** Throws `notifications_denied` when the user has turned notifications off for the app */
async function scheduleNotification(fireAt: number, label: string): Promise<void> {
    if (!(await PushNotifications.requestPermission())) throw new Error('notifications_denied');
    await notifee.createTriggerNotification(
        {
            title: label,
            body: i18n.t('tools.set_reminder.notification_body'),
            ios: {
                sound: 'default',
                // Time Sensitive needs an entitlement - active still shows on the lock screen and in Focus summaries.
                interruptionLevel: 'active',
                foregroundPresentationOptions: { banner: true, list: true, sound: true },
            },
        },
        { type: TriggerType.TIMESTAMP, timestamp: fireAt },
    );
}
