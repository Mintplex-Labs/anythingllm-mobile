import { Linking } from 'react-native';
import { type CalendarEventCitation } from '@/utils/calendar';

/** Seconds between the Unix epoch and 2001-01-01 UTC - the reference date iOS `calshow:` links count from */
const APPLE_EPOCH_OFFSET_S = 978307200;

/**
 * Opens an event the read-calendar tool cited. iOS has no link to a single event, so the Calendar
 * app opens on its day. Throws when Calendar could not be opened.
 * @see calendarView.ts
 */
export async function viewCalendarEvent(event: Pick<CalendarEventCitation['event'], 'id' | 'beginTime' | 'endTime'>): Promise<void> {
  await Linking.openURL(`calshow:${Math.floor(event.beginTime / 1000) - APPLE_EPOCH_OFFSET_S}`);
}
