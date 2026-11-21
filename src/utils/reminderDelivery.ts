import { NativeModules } from 'react-native';
import moment from 'moment';
import { type IReminderAction } from '@/database/models/WorkspaceChat';
import { CALENDAR_REMINDER_LENGTH_MS, saveCalendarReminder } from '@/utils/reminders';

const { AlarmModule, MessagingModule } = NativeModules;

/**
 * Where reminders go. Within a day: the clock app, as an alarm or a timer, which then owns it and
 * rings like any other. Further out: the calendar, as a short event with an alert.
 * @see reminderDelivery.ios.ts
 */

/** Where a reminder within a day ends up, for the model - English */
export const SHORT_REMINDER_PLACE = 'in the clock app';
/** Where a reminder further out ends up, for the model - English */
export const LATER_REMINDER_PLACE = "the user's calendar";
/** What the card shows a reminder further out as */
export const LATER_REMINDER_KIND = 'calendar' as const;

/** Translation keys for the copy that says where reminders go */
export const REMINDER_COPY_KEYS = {
    description: 'tools.set_reminder.description',
    approvalAlarm: 'tools.set_reminder.approval_alarm',
    approvalTimer: 'tools.set_reminder.approval_timer',
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

/** Adds a reminder too far out for the clock app to the calendar and returns the event id */
export const saveLaterReminder = saveCalendarReminder;

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
