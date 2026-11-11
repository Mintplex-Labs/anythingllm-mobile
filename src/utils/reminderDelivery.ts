import { NativeModules } from 'react-native';
import moment from 'moment';
import { type IReminderAction } from '@/database/models/WorkspaceChat';
import { CALENDAR_REMINDER_LENGTH_MS } from '@/utils/reminders';

const { AlarmModule, MessagingModule } = NativeModules;

/**
 * Where reminders within a day go: the clock app, as an alarm or a timer, which then owns it and
 * rings like any other.
 * @see reminderDelivery.ios.ts
 */

/** Where a reminder within a day ends up, for the model - English */
export const SHORT_REMINDER_PLACE = 'in the clock app';

/** Translation keys for the copy that says where reminders go */
export const REMINDER_COPY_KEYS = {
    description: 'tools.set_reminder.description',
    approvalCalendar: 'tools.set_reminder.approval_calendar',
    openFailed: 'chat.reminder_card.open_clock_failed',
} as const;

/** Hands a one-off alarm to the clock app. Throws when there is no clock app or it refuses. */
export async function setClockAlarm(fireAt: number, label: string): Promise<void> {
    const when = moment(fireAt);
    await AlarmModule.setAlarm(when.hour(), when.minute(), label);
}

/** Starts a countdown timer in the clock app. Throws when there is no clock app or it refuses. */
export async function setClockTimer(seconds: number, label: string): Promise<void> {
    await AlarmModule.setTimer(seconds, label);
}

/** Every reminder lives in an app the card can open */
export function canOpenReminder(_kind: IReminderAction['action']['kind']): boolean {
    return true;
}

/** Opens what the card stands for: the clock app's alarms or timers, or the calendar event. Throws when nothing can open it. */
export async function openReminder(reminder: IReminderAction['action']): Promise<void> {
    if (reminder.kind === 'alarm') return AlarmModule.showAlarms();
    if (reminder.kind === 'timer') return AlarmModule.showTimers();
    if (!reminder.eventId) throw new Error('missing_event');
    await MessagingModule.viewCalendarEvent(reminder.eventId, reminder.fireAt, reminder.fireAt + CALENDAR_REMINDER_LENGTH_MS);
}
