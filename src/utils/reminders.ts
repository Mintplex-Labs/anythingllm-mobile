import { NativeModules } from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';
import moment from 'moment';
import { type IReminderAction } from '@/database/models/WorkspaceChat';
import { ensureCalendarPermission } from '@/utils/calendar';
import i18n from '@/i18n';

const { AlarmModule, MessagingModule } = NativeModules;

export type ReminderKind = IReminderAction['action']['kind'];

/** The clock app's alarms have no date and its timers top out here - anything later becomes a calendar reminder */
export const CLOCK_HORIZON_MS = 24 * 60 * 60 * 1000;
/** How long a calendar reminder event lasts - long enough to show as a block, short enough not to fill the day */
const CALENDAR_REMINDER_LENGTH_MS = 15 * 60 * 1000;
/** Furthest ahead a reminder can be set - anything past it is a mistake, not a plan */
const MAX_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_FORMATS = ['HH:mm', 'H:mm', 'HH:mm:ss', 'h:mm A', 'h:mmA', 'h:mm a', 'h:mma', 'h A', 'hA', 'h a', 'ha'];

export type ResolvedReminder =
  | { ok: true; fireAt: number; kind: ReminderKind; durationSeconds: number | null }
  | { ok: false; error: string };

/**
 * When the reminder fires and how it is set, from the tool's arguments. Relative reminders
 * (`inMinutes`) within a day become clock timers, clock times within a day become clock alarms,
 * and anything further out becomes a calendar event with an alert at its start. Errors are
 * written for the model, in English.
 */
export function resolveReminder(
  input: { inMinutes?: unknown; atTime?: unknown; onDate?: unknown },
  now = Date.now(),
): ResolvedReminder {
  const minutes = typeof input.inMinutes === 'string' ? Number(input.inMinutes.trim()) : input.inMinutes;
  if (minutes !== undefined && minutes !== null && minutes !== '') {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return { ok: false, error: `in_minutes must be a positive number, got "${String(input.inMinutes)}".` };
    const durationMs = Math.round(minutes * 60) * 1000;
    if (durationMs > MAX_AHEAD_MS) return { ok: false, error: 'That is too far ahead to set a reminder for.' };
    const fireAt = now + Math.max(1000, durationMs);
    return durationMs <= CLOCK_HORIZON_MS
      ? { ok: true, fireAt, kind: 'timer', durationSeconds: Math.max(1, Math.round(durationMs / 1000)) }
      : { ok: true, fireAt, kind: 'calendar', durationSeconds: null };
  }

  const timeText = String(input.atTime ?? '').trim();
  if (!timeText) return { ok: false, error: 'Give either in_minutes, or at_time (with an optional on_date).' };
  const time = moment(timeText.toUpperCase(), TIME_FORMATS, true);
  if (!time.isValid()) return { ok: false, error: `"${timeText}" is not a time. Use 24-hour "HH:mm" eg: "15:30".` };

  const day = resolveDay(String(input.onDate ?? '').trim(), time, now);
  if (!day.ok) return day;
  const fireAt = day.date.valueOf();
  if (fireAt <= now) return { ok: false, error: `${day.date.clone().locale('en').format('llll')} has already passed. Ask the user when they meant.` };
  if (fireAt - now > MAX_AHEAD_MS) return { ok: false, error: 'That is too far ahead to set a reminder for.' };
  return { ok: true, fireAt, kind: fireAt - now <= CLOCK_HORIZON_MS ? 'alarm' : 'calendar', durationSeconds: null };
}

/**
 * Re-checks a reminder once the user approved it - the approval card can wait up to a minute.
 * Timers count from the approval, so their end moves with it. An alarm whose time went by while
 * waiting is refused: the clock app would otherwise set it for the same time tomorrow.
 */
export function confirmAfterApproval(reminder: Extract<ResolvedReminder, { ok: true }>, now = Date.now()): ResolvedReminder {
  if (reminder.kind === 'timer') return { ...reminder, fireAt: now + reminder.durationSeconds! * 1000 };
  if (reminder.fireAt <= now) return { ok: false, error: `${moment(reminder.fireAt).locale('en').format('LT')} passed while waiting for the user to approve it.` };
  return reminder;
}

/** The day the time falls on: a date, "today", "tomorrow", a weekday (its next occurrence) or nothing (the next time it comes round) */
function resolveDay(dayText: string, time: moment.Moment, now: number): { ok: true; date: moment.Moment } | { ok: false; error: string } {
  const at = (day: moment.Moment) => day.clone().set({ hour: time.hour(), minute: time.minute(), second: 0, millisecond: 0 });
  const today = moment(now).startOf('day');
  const text = dayText.toLowerCase();
  if (!text) {
    const candidate = at(today);
    return { ok: true, date: candidate.valueOf() > now ? candidate : candidate.add(1, 'day') };
  }
  if (text === 'today') return { ok: true, date: at(today) };
  if (text === 'tomorrow') return { ok: true, date: at(today.clone().add(1, 'day')) };
  const weekday = text.length >= 3 ? WEEKDAYS.findIndex(name => name.startsWith(text)) : -1;
  if (weekday !== -1) {
    // Today counts when the time is still ahead - "Friday at 5" said on a Friday morning means today.
    let candidate = at(today.clone().day(weekday));
    if (candidate.isBefore(today)) candidate.add(1, 'week');
    if (candidate.valueOf() <= now) candidate.add(1, 'week');
    return { ok: true, date: candidate };
  }
  const date = moment(dayText.slice(0, 10), 'YYYY-MM-DD', true);
  if (!date.isValid()) return { ok: false, error: `"${dayText}" is not a date. Use "YYYY-MM-DD", "today", "tomorrow" or a weekday name.` };
  return { ok: true, date: at(date) };
}

/** Hands a one-off alarm to the clock app. Throws when there is no clock app or it refuses. */
export async function setClockAlarm(fireAt: number, label: string): Promise<void> {
  const when = moment(fireAt);
  await AlarmModule.setAlarm(when.hour(), when.minute(), label);
}

/** Starts a countdown timer in the clock app. Throws when there is no clock app or it refuses. */
export async function setClockTimer(seconds: number, label: string): Promise<void> {
  await AlarmModule.setTimer(seconds, label);
}

/**
 * Adds a short event with an alert at its start to the user's primary writable calendar, asking
 * for calendar access if needed. Returns the event id. Throws `calendar_permission_denied` or
 * `no_writable_calendar`.
 */
export async function saveCalendarReminder(fireAt: number, label: string): Promise<string> {
  if (!(await ensureCalendarPermission(false))) throw new Error('calendar_permission_denied');
  const calendars = (await RNCalendarEvents.findCalendars()).filter(calendar => calendar.allowsModifications);
  // Without a calendarId the library falls back to calendar id 1, which may not be the user's - pick one ourselves.
  const calendar = calendars.find(item => item.isPrimary) ?? calendars[0];
  if (!calendar) throw new Error('no_writable_calendar');
  return RNCalendarEvents.saveEvent(label, {
    calendarId: calendar.id,
    startDate: new Date(fireAt).toISOString(),
    endDate: new Date(fireAt + CALENDAR_REMINDER_LENGTH_MS).toISOString(),
    // Minutes before the start - 0 alerts right as it begins.
    alarms: [{ date: 0 }],
    notes: i18n.t('tools.set_reminder.calendar_notes'),
  });
}

/** Opens what the card stands for: the clock app's alarms or timers, or the calendar event. Throws when nothing can open it. */
export async function openReminder(reminder: IReminderAction['action']): Promise<void> {
  if (reminder.kind === 'alarm') return AlarmModule.showAlarms();
  if (reminder.kind === 'timer') return AlarmModule.showTimers();
  if (!reminder.eventId) throw new Error('missing_event');
  await MessagingModule.viewCalendarEvent(reminder.eventId, reminder.fireAt, reminder.fireAt + CALENDAR_REMINDER_LENGTH_MS);
}

/** "Today · 3:00 PM", "Tomorrow · 9:00 AM" or "Fri, Oct 3 · 9:00 AM" (with the year when it is not this one) */
export function formatReminderWhen(fireAt: number, now = Date.now()): string {
  const when = moment(fireAt);
  const today = moment(now);
  const day = when.isSame(today, 'day')
    ? i18n.t('chat.reminder_card.today')
    : when.isSame(today.clone().add(1, 'day'), 'day')
      ? i18n.t('chat.reminder_card.tomorrow')
      : when.format(when.isSame(today, 'year') ? 'ddd, MMM D' : 'ddd, MMM D, YYYY');
  return `${day} · ${when.format('LT')}`;
}

/**
 * "20 minutes", "1 hour 30 minutes" - exact, unlike moment's humanize which rounds 90 minutes to
 * "2 hours". Pass `lng: 'en'` for text that goes back to the model.
 */
export function formatDuration(seconds: number, lng?: string): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [
    hours ? i18n.t('chat.reminder_card.duration.hours', { count: hours, lng }) : null,
    minutes ? i18n.t('chat.reminder_card.duration.minutes', { count: minutes, lng }) : null,
    // Seconds only matter for short timers.
    rest && seconds < 600 ? i18n.t('chat.reminder_card.duration.seconds', { count: rest, lng }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : i18n.t('chat.reminder_card.duration.seconds', { count: seconds, lng });
}
