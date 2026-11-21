import { NativeModules } from 'react-native';
import { type CalendarEventCitation } from '@/utils/calendar';

const { MessagingModule } = NativeModules;

/**
 * Opens an event the read-calendar tool cited, in the calendar app it lives in. Throws when no
 * calendar app could open it.
 * @see calendarView.ios.ts
 */
export async function viewCalendarEvent(event: Pick<CalendarEventCitation['event'], 'id' | 'beginTime' | 'endTime'>): Promise<void> {
  await MessagingModule.viewCalendarEvent(event.id, event.beginTime, event.endTime);
}
