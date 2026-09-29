import { Linking, NativeModules, Platform } from 'react-native';
import RNCalendarEvents, { type CalendarEventReadable, type CalendarEventWritable } from 'react-native-calendar-events';
import moment from 'moment';
import { type IAgentAction, type IAgentCalendarEventCitation, type ICalendarEventAction, type ICalendarRecurrence } from '@/database/models/WorkspaceChat';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { parseEmailAddresses, type MessagingApp } from '@/utils/messaging';
import i18n from '@/i18n';
import { generateUUID } from '@/utils/constants';
import { sanitizeFilename } from '@/utils/documents/shared';
import { shareDeviceFile, writeToDeviceDownloads, type SavedDeviceFile } from '@/utils/fs/deviceDownloads';

const { MessagingModule } = NativeModules;

/** A drafted event with every optional detail filled in with its default (see `normalizeCalendarEvent`) */
export type CalendarEvent = Required<ICalendarEventAction['action']>;
export type CalendarEventCitation = IAgentCalendarEventCitation;

/** Events with no usable end last an hour, like most calendar apps default to */
const DEFAULT_EVENT_LENGTH_MS = 60 * 60 * 1000;

const FREQUENCIES: ICalendarRecurrence['frequency'][] = ['daily', 'weekly', 'monthly', 'yearly'];
/** iCalendar day codes, indexed like `moment().day()` (Sunday first) */
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** Longest repeat / reminder the model can ask for - anything past it is a mistake, not a plan */
const MAX_REPEAT_INTERVAL = 99;
const MAX_REPEAT_COUNT = 999;
const MAX_REMINDER_MINUTES = 4 * 7 * 24 * 60;
const MAX_REMINDERS = 5;

/** A whole number from 1 to `max`, from a number or numeric string - null otherwise */
function positiveInt(value: unknown, max: number): number | null {
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}

/** "MO", "monday" or "Mon" - to the iCalendar code, null when it is not a weekday */
function toDayCode(value: unknown): string | null {
  const text = String(value ?? '').trim().toUpperCase();
  if (DAY_CODES.includes(text)) return text;
  const index = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].indexOf(text.slice(0, 3));
  return index === -1 ? null : DAY_CODES[index];
}

/**
 * How the event repeats, from the draft tool's flat arguments (or a stored recurrence). Anything
 * unusable is dropped rather than failing the event: no frequency means a one-off, a bad interval
 * means 1, a count and an end date together keep the end date.
 */
export function parseRecurrence(
  input: { frequency?: unknown; interval?: unknown; days?: unknown; count?: unknown; until?: unknown },
  beginTime: number,
): ICalendarRecurrence | null {
  const frequency = String(input.frequency ?? '').trim().toLowerCase() as ICalendarRecurrence['frequency'];
  if (!FREQUENCIES.includes(frequency)) return null;
  const days = Array.isArray(input.days) ? input.days : typeof input.days === 'string' ? input.days.split(/[,\s]+/) : [];
  const until = toTimestamp(input.until);
  return {
    frequency,
    interval: positiveInt(input.interval, MAX_REPEAT_INTERVAL) ?? 1,
    // Days only mean something for weekly repeats - monthly "every 2nd Tuesday" is out of scope.
    byDay: frequency === 'weekly' ? [...new Set(days.map(toDayCode).filter((code): code is string => !!code))] : [],
    until: until !== null && until > beginTime ? until : null,
    count: until !== null && until > beginTime ? null : positiveInt(input.count, MAX_REPEAT_COUNT),
  };
}

/** Minutes-before values from a number, numeric string or list of them - deduplicated, earliest reminder first */
export function parseReminders(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  const minutes = values
    .map(item => (typeof item === 'string' ? Number(item.trim()) : item))
    .filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= MAX_REMINDER_MINUTES);
  return [...new Set(minutes)].sort((a, b) => b - a).slice(0, MAX_REMINDERS);
}

/** A meeting link, given a scheme if the model left it off ("zoom.us/j/123"). Null when it is not a web link. */
export function parseMeetingUrl(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text || /\s/.test(text)) return null;
  if (/^https?:\/\/\S+\.\S+/i.test(text)) return text;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? `https://${text}` : null;
}

/** The notes with the meeting link on the end - Android's new-event screen has no field for a link */
export function descriptionWithUrl(event: CalendarEvent): string {
  if (!event.url || event.description.includes(event.url)) return event.description;
  return event.description ? `${event.description}\n\n${event.url}` : event.url;
}

/** The event's repeat as an iCalendar RRULE value eg: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10" - null for a one-off */
export function buildRrule(event: CalendarEvent): string | null {
  const recurrence = event.recurrence;
  if (!recurrence) return null;
  const parts = [`FREQ=${recurrence.frequency.toUpperCase()}`];
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.byDay.length) parts.push(`BYDAY=${recurrence.byDay.join(',')}`);
  if (recurrence.until !== null) {
    // UNTIL must match DTSTART's type: a date for all-day events, else a UTC time - the end of the last day.
    const lastDay = moment(recurrence.until);
    parts.push(`UNTIL=${event.allDay ? lastDay.format('YYYYMMDD') : moment.utc(lastDay.endOf('day').valueOf()).format('YYYYMMDD[T]HHmmss[Z]')}`);
  } else if (recurrence.count !== null) {
    parts.push(`COUNT=${recurrence.count}`);
  }
  return parts.join(';');
}

/** "Every 2 weeks on Mon, Wed until Dec 1, 2026" - or just "Weekly" when `detailed` is false */
export function describeRecurrence(recurrence: ICalendarRecurrence, detailed = true): string {
  const count = recurrence.interval;
  let text = {
    daily: i18n.t('chat.calendar_event.repeat.daily', { count }),
    weekly: i18n.t('chat.calendar_event.repeat.weekly', { count }),
    monthly: i18n.t('chat.calendar_event.repeat.monthly', { count }),
    yearly: i18n.t('chat.calendar_event.repeat.yearly', { count }),
  }[recurrence.frequency];
  if (!detailed) return text;
  if (recurrence.byDay.length) {
    const days = recurrence.byDay.map(code => moment.weekdaysShort(DAY_CODES.indexOf(code))).join(', ');
    text = i18n.t('chat.calendar_event.repeat.on_days', { repeat: text, days });
  }
  if (recurrence.until !== null) text = i18n.t('chat.calendar_event.repeat.until', { repeat: text, date: moment(recurrence.until).format('ll') });
  else if (recurrence.count !== null) text = i18n.t('chat.calendar_event.repeat.times', { repeat: text, count: recurrence.count });
  return text;
}

/** "Reminder: 1 day before, 30 minutes before" - empty when the calendar app's default applies */
export function describeReminders(minutes: number[]): string {
  if (!minutes.length) return '';
  const times = minutes.map(value => (value === 0
    ? i18n.t('chat.calendar_event.reminder_at_start')
    : i18n.t('chat.calendar_event.reminder_before', { time: moment.duration(value, 'minutes').humanize() })));
  return i18n.t('chat.calendar_event.reminders', { times: times.join(', ') });
}

/**
 * Epoch millis from whatever the model sent - millis (number or numeric string), epoch seconds,
 * or an ISO 8601 date. Null when it is none of those.
 */
export function toTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e11 ? numeric * 1000 : numeric; // below 1e11 can only be seconds
  const text = String(value).trim();
  // A bare date is a day on the user's calendar - Date.parse would read it as UTC midnight, the day before west of UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const day = moment(text, 'YYYY-MM-DD', true);
    return day.isValid() ? day.valueOf() : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pulls a valid event out of a chat action, filling in the defaults for details it leaves out -
 * old rows may hold unparsable times, an end before the start, or none of the newer fields.
 */
export function normalizeCalendarEvent(action: IAgentAction): CalendarEvent | null {
  if (action.type !== 'calendar_event_creation') return null;
  const event = action.action;
  const beginTime = toTimestamp(event.beginTime);
  if (beginTime === null || !event.title) return null;
  const endTime = toTimestamp(event.endTime);
  const recurrence = event.recurrence;
  return {
    title: event.title,
    beginTime,
    endTime: endTime !== null && endTime > beginTime ? endTime : beginTime + DEFAULT_EVENT_LENGTH_MS,
    eventLocation: event.eventLocation ?? '',
    description: event.description ?? '',
    allDay: !!event.allDay,
    attendees: parseEmailAddresses(event.attendees ?? []),
    recurrence: recurrence
      ? parseRecurrence({ frequency: recurrence.frequency, interval: recurrence.interval, days: recurrence.byDay, count: recurrence.count, until: recurrence.until }, beginTime)
      : null,
    reminderMinutes: parseReminders(event.reminderMinutes),
    url: parseMeetingUrl(event.url),
  };
}

let calendarAppCache: Promise<MessagingApp | null> | null = null;

/**
 * The app new events open in (the default calendar app, or the only one installed), for its icon
 * on the event card. Null off Android, or when several are installed with no default. Cached for
 * the session since every event card asks.
 */
export function getCalendarApp(): Promise<MessagingApp | null> {
  if (Platform.OS !== 'android' || !MessagingModule?.getCalendarApp) return Promise.resolve(null);
  if (!calendarAppCache) {
    calendarAppCache = MessagingModule.getCalendarApp().catch((error: unknown) => {
      // Only costs the card its app icon - not worth an error.
      console.warn('[calendar] finding the calendar app failed', error);
      calendarAppCache = null;
      return null;
    });
  }
  return calendarAppCache as Promise<MessagingApp | null>;
}

/**
 * Opens [packageName]'s new-event screen with the event filled in, for the user to review and save
 * - no calendar permission needed. Android only (see DraftSheet). Throws if the app is gone or refuses it.
 */
export async function openCalendarEventInApp(packageName: string, event: CalendarEvent): Promise<void> {
  // Reminders cannot be passed - the app applies its own default (DraftSheet says so).
  await MessagingModule.openCalendarEvent(
    packageName,
    event.title,
    event.beginTime,
    event.endTime,
    event.allDay,
    event.eventLocation,
    descriptionWithUrl(event),
    buildRrule(event),
    event.attendees.length ? event.attendees.join(',') : null,
  );
}

/**
 * iOS has no new-event screen we can reach, so there the event is saved straight to the default
 * calendar (the user tapped to add it), which needs write access. Throws `calendar_permission_denied`
 * when access is refused. iOS apps cannot add invitees, and weekly repeats fall on the start's weekday.
 */
export async function saveCalendarEventOnIos(event: CalendarEvent): Promise<void> {
  if (!(await ensureCalendarPermission(false))) throw new Error('calendar_permission_denied');
  const recurrence = event.recurrence;
  await RNCalendarEvents.saveEvent(event.title, {
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

/** Escapes a TEXT value for an iCalendar property (RFC 5545 3.3.11) */
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing on lines that start with a space (RFC 5545 3.1) */
function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = char.codePointAt(0)! < 0x80 ? 1 : char.codePointAt(0)! < 0x800 ? 2 : char.codePointAt(0)! < 0x10000 ? 3 : 4;
    // Continuation lines lose one octet to the leading space.
    if (octets + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * The event as an iCalendar (.ics) file, which any calendar app, mail client or computer can
 * import - the way out when no calendar app is installed. Timed events are written in UTC, all-day
 * events as local dates with an exclusive end, as the spec expects.
 */
export function buildIcs(event: CalendarEvent): string {
  const utc = (millis: number) => moment.utc(millis).format('YYYYMMDD[T]HHmmss[Z]');
  let when: string[];
  if (event.allDay) {
    const firstDay = moment(event.beginTime).startOf('day');
    // Our all-day end may be the last day itself or midnight after it - either way the file wants the day after.
    const lastDay = moment(Math.max(event.beginTime, event.endTime - 1)).startOf('day');
    when = [`DTSTART;VALUE=DATE:${firstDay.format('YYYYMMDD')}`, `DTEND;VALUE=DATE:${lastDay.add(1, 'day').format('YYYYMMDD')}`];
  } else {
    when = [`DTSTART:${utc(event.beginTime)}`, `DTEND:${utc(event.endTime)}`];
  }
  const rrule = buildRrule(event);
  // The link also goes in the notes - Google Calendar and others do not show URL.
  const description = descriptionWithUrl(event);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mintplex Labs//AnythingLLM Mobile//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${generateUUID()}@anythingllm`,
    `DTSTAMP:${utc(Date.now())}`,
    ...when,
    rrule ? `RRULE:${rrule}` : null,
    `SUMMARY:${icsText(event.title)}`,
    event.eventLocation ? `LOCATION:${icsText(event.eventLocation)}` : null,
    description ? `DESCRIPTION:${icsText(description)}` : null,
    // URL is a URI value, not TEXT - commas and semicolons stay as they are.
    event.url ? `URL:${event.url}` : null,
    ...event.attendees.map(address => `ATTENDEE;RSVP=TRUE:mailto:${address}`),
    ...event.reminderMinutes.flatMap(minutes => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(event.title)}`,
      `TRIGGER:-PT${minutes}M`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => !!line);
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

const ICS_MIME_TYPE = 'text/calendar';

/** Saves the event as an .ics file in Downloads (Android) or the app's Files folder (iOS) */
export async function saveEventAsIcs(event: CalendarEvent): Promise<SavedDeviceFile> {
  return writeToDeviceDownloads({ filename: sanitizeFilename(event.title, 'ics', 'event'), content: buildIcs(event), encoding: 'utf8' });
}

/** Hands the event as an .ics file to the share sheet - for calendar apps we do not list, or to send it on */
export async function shareEventAsIcs(event: CalendarEvent): Promise<void> {
  const filename = sanitizeFilename(event.title, 'ics', 'event');
  const folder = `${RNFS.CachesDirectoryPath}/calendar-events`;
  if (!(await RNFS.exists(folder))) await RNFS.mkdir(folder);
  const path = `${folder}/${filename}`;
  await RNFS.writeFile(path, buildIcs(event), 'utf8');
  await shareDeviceFile({ path, filename, mimeType: ICS_MIME_TYPE });
}

/** Seconds between the Unix epoch and 2001-01-01 UTC - the reference date iOS `calshow:` links count from */
const APPLE_EPOCH_OFFSET_S = 978307200;

/**
 * Opens an event the read-calendar tool cited. Android opens the event itself; iOS has no link to
 * a single event, so the Calendar app opens on its day. Throws when no calendar app could open it.
 */
export async function viewCalendarEvent(event: CalendarEventCitation['event']): Promise<void> {
  if (Platform.OS === 'android') {
    await MessagingModule.viewCalendarEvent(event.id, event.beginTime, event.endTime);
    return;
  }
  await Linking.openURL(`calshow:${Math.floor(event.beginTime / 1000) - APPLE_EPOCH_OFFSET_S}`);
}

/** "Tue, Sep 30 · 2:00 PM – 3:00 PM", with both dates when the event spans days */
export function formatEventWhen(event: { beginTime: number; endTime: number; allDay: boolean }, allDayLabel: string): string {
  const begin = moment(event.beginTime);
  // All-day ends are exclusive in most calendars - an event ending at midnight belongs to the day before.
  const end = moment(event.allDay ? Math.max(event.beginTime, event.endTime - 1) : event.endTime);
  const sameDay = begin.isSame(end, 'day');
  const day = (date: moment.Moment) => date.format(date.isSame(moment(), 'year') ? 'ddd, MMM D' : 'ddd, MMM D, YYYY');
  if (event.allDay) return sameDay ? `${day(begin)} · ${allDayLabel}` : `${day(begin)} – ${day(end)} · ${allDayLabel}`;
  if (sameDay) return `${day(begin)} · ${begin.format('LT')} – ${end.format('LT')}`;
  return `${day(begin)}, ${begin.format('LT')} – ${day(end)}, ${end.format('LT')}`;
}

/** Turns an event read from the calendar into a source for the sources sheet. Null when it has no usable time. */
export function toCalendarCitation(event: CalendarEventReadable): CalendarEventCitation | null {
  const beginTime = toTimestamp(event.startDate);
  if (beginTime === null) return null;
  const endTime = toTimestamp(event.endDate);
  return {
    type: 'calendar-event',
    event: {
      id: String(event.id),
      title: event.title || '',
      beginTime,
      endTime: endTime !== null && endTime > beginTime ? endTime : beginTime + DEFAULT_EVENT_LENGTH_MS,
      allDay: !!event.allDay,
      location: event.location ?? '',
      description: (event.description ?? event.notes ?? '').trim(),
      calendarTitle: event.calendar?.title ?? null,
      calendarColor: event.calendar?.color ?? null,
    },
  };
}

/** Asks for calendar access if it has not been granted yet. `readOnly` asks for read access only (Android). */
export async function ensureCalendarPermission(readOnly = true): Promise<boolean> {
  try {
    if ((await RNCalendarEvents.checkPermissions(readOnly)) === 'authorized') return true;
    return (await RNCalendarEvents.requestPermissions(readOnly)) === 'authorized';
  } catch (error) {
    console.error('[calendar] permission request failed', error);
    return false;
  }
}
