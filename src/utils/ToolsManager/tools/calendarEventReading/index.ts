import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import RNCalendarEvents from "react-native-calendar-events";
import { ensureCalendarPermission, toCalendarCitation, type CalendarEventCitation } from "@/utils/calendar";
import i18n, { tKey } from "@/i18n";
import {
    parseArgs,
    getDateRange,
    allDayEventsOverlap,
    sortEventsByDate,
    formatTimedEvent,
    formatAllDayEvent,
    type SearchType,
} from './calendarFormat';

/** Status line shown while reading, per `search` value */
const READING_STATUS: Record<string, string> = {
    'today': tKey('tools.calendar_event_reading.status_today'),
    'tomorrow': tKey('tools.calendar_event_reading.status_tomorrow'),
    'this week': tKey('tools.calendar_event_reading.status_this_week'),
    'next week': tKey('tools.calendar_event_reading.status_next_week'),
    'this month': tKey('tools.calendar_event_reading.status_this_month'),
    'next month': tKey('tools.calendar_event_reading.status_next_month'),
};

export default {
    id: 'calendarEventReading',
    get name() { return i18n.t('tools.calendar_event_reading.name'); },
    get description() { return i18n.t('tools.calendar_event_reading.description'); },
    defaultEnabled: false,
    category: 'appConnections',
    group: 'calendar',
    // Ask when the user turns the tool on, so a reply is never stuck behind the permission dialog.
    requestPermission: () => ensureCalendarPermission(true),
    get permissionDeniedMessage() { return i18n.t('tools.calendar_event_reading.permission_denied'); },
    definition: {
        type: 'function',
        function: {
            name: 'read_calendar_events',
            description: 'Read the calendar events for the given time range. Returns events sorted chronologically. Each event includes: title, date, start and end time (or "all day"), duration, location (if set), attendees, and description.',
            parameters: {
                type: 'object',
                properties: {
                    search: {
                        type: 'string',
                        description: 'The search query to filter the calendar events. Optional. Allowed values: today, tomorrow, this week, next week, this month, next month, specific date.',
                        enum: ['today', 'tomorrow', 'this week', 'next week', 'this month', 'next month', 'specific date'],
                    },
                    specificDate: {
                        type: 'string',
                        description: 'The specific date to search for in YYYY-MM-DD format. Required if search is "specific date"; if provided alone without search, it is used as the date.',
                    },
                },
                required: [],
            },
        },
    },
    config: {},
    execute: async function (args: string | { search?: string; specificDate?: string }, streamEmitter: (event: IStreamEvent, data: any) => void) {
        try {
            const parsedArgs = parseArgs(args);
            if (parsedArgs.error) {
                return parsedArgs.error;
            }

            const { startDate, endDate } = getDateRange(parsedArgs.search, parsedArgs.specificDate);
            const searchType: SearchType = parsedArgs.search;
            const label = searchType === 'specific date' ? parsedArgs.specificDate ?? searchType : searchType;

            streamEmitter('report_status', searchType === 'specific date' || !READING_STATUS[searchType]
                ? i18n.t('tools.calendar_event_reading.status_date', { date: label })
                : i18n.t(READING_STATUS[searchType]));

            // Normally granted when the tool was switched on - access can be revoked in settings since.
            if (!(await ensureCalendarPermission(true))) return 'Calendar access is not granted, so the calendar could not be read. Tell the user to allow calendar access for AnythingLLM in their phone settings.';

            const allEvents = await RNCalendarEvents.fetchAllEvents(startDate, endDate);
            if (!allEvents?.length) return `There are no events in the user's calendar for ${label}.`;

            // Filter out all-day events whose date range doesn't overlap the requested range.
            const filteredEvents = allEvents.filter(event => {
                if (!event.allDay) return true;
                return allDayEventsOverlap(event.startDate, event.endDate ?? event.startDate, startDate, endDate);
            });

            if (!filteredEvents.length) return `There are no events in the user's calendar for ${label}.`;

            // Sort chronologically.
            const sortedEvents = sortEventsByDate(filteredEvents);

            // Build citations from the filtered list.
            const citations = sortedEvents.map(toCalendarCitation).filter((citation): citation is CalendarEventCitation => !!citation);
            if (citations.length > 0) streamEmitter('report_citations', citations);

            let eventText = `You have ${sortedEvents.length} events in your calendar for ${label}:\n\n`;
            const eventDescriptions: string[] = [];

            for (const event of sortedEvents) {
                let eventDescription: string;

                if (event.allDay) {
                    eventDescription = formatAllDayEvent(event.title, event.startDate, event.endDate, event.location);
                } else {
                    eventDescription = formatTimedEvent(
                        event.title,
                        event.startDate,
                        event.endDate,
                        event.location,
                    );
                }

                eventDescription += '.';

                if (event.attendees?.length) {
                    eventDescription += ' ';
                    const attendees: string[] = [];
                    for (const attendee of event.attendees) {
                        if (attendee.name) attendees.push(`${attendee.name} (${attendee.email})`);
                        else attendees.push(`${attendee.email}`);
                    }
                    eventDescription += `The attendees are ${attendees.join(', ')}.`;
                }

                const desc = this._formatEventDescription(event.description as string);
                if (desc) {
                    eventDescription += ' ' + desc;
                }
                eventDescriptions.push(eventDescription);
            }

            eventText += eventDescriptions.join('\n---\n');
            return eventText;
        } catch (e) {
            console.error(`Calendar Event Reading Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error reading the calendar.`;
        }
    },
    _formatEventDescription: function (descriptionContent: string): string {
        if (!descriptionContent) return '';

        if (descriptionContent.includes('Join Zoom Meeting')) {
            const regex = /(join\s+zoom\s+meeting)/i;
            const parts = descriptionContent.split(regex);
            descriptionContent = parts[0]?.trim();
        }

        if (descriptionContent.includes('Microsoft Teams Need help?')) {
            const regex = /(microsoft\s+teams\s+need\s+help\?)/i;
            const parts = descriptionContent.split(regex);
            descriptionContent = parts[0]?.replace('_', '').trim(); // underscores are used to separate the text note from the schedule links
        }

        const keyPhrasesRegex = [
            /(need\s+to\s+make\s+changes\s+to\s+this\s+event\?)/i,
            /(this\s+is\s+a\s+google\s+meet\s+web\s+conference\.)/i,
        ];

        // Remove all the key phrases from the description content
        for (const keyPhraseRegex of keyPhrasesRegex) {
            const parts = descriptionContent.split(keyPhraseRegex);
            if (parts?.[0]) descriptionContent = parts[0]?.trim();
        }

        return descriptionContent ? `Event Description: ${descriptionContent}.` : '';
    }
} as const;
