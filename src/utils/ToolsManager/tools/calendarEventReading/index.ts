import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import RNCalendarEvents from "react-native-calendar-events";
import { ensureCalendarPermission, toCalendarCitation, type CalendarEventCitation } from "@/utils/calendar";
import moment from 'moment';
import i18n, { tKey } from "@/i18n";

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
            description: 'Read the calendar events for the given time range for the users',
            parameters: {
                type: 'object',
                properties: {
                    search: {
                        type: 'string',
                        description: 'The search query to filter the calendar events. Optional.',
                        enum: ['today', 'tomorrow', 'this week', 'next week', 'this month', 'next month', 'specific date'],
                    },
                    specificDate: {
                        type: 'string',
                        description: 'The specific date to search for in ISO 8601 format. Required if search is "specific date".',
                    },
                },
                required: [],
            },
        },
    },
    config: {},
    execute: async function (args: { startDate: string, endDate: string }, streamEmitter: (event: IStreamEvent, data: any) => void) {
        try {
            const parsedArgs = typeof args === 'string' ? safeJsonParse(args) : args;
            const { search = 'today', specificDate = moment().format('YYYY-MM-DD') } = parsedArgs;
            const { startDate, endDate } = this._searchTypeToDate(search, specificDate);
            streamEmitter('report_status', search === 'specific date' || !READING_STATUS[search]
                ? i18n.t('tools.calendar_event_reading.status_date', { date: search === 'specific date' ? specificDate : search })
                : i18n.t(READING_STATUS[search]));

            // Normally granted when the tool was switched on - access can be revoked in settings since.
            if (!(await ensureCalendarPermission(true))) return 'Calendar access is not granted, so the calendar could not be read. Tell the user to allow calendar access for AnythingLLM in their phone settings.';

            const events = await RNCalendarEvents.fetchAllEvents(startDate, endDate);
            if (!events?.length) return `There are no events in the user's calendar for ${search === 'specific date' ? specificDate : search}.`;

            // Every event read is a source the user can open in their calendar app.
            const citations = events.map(toCalendarCitation).filter((citation): citation is CalendarEventCitation => !!citation);
            if (citations.length > 0) streamEmitter('report_citations', citations);

            let eventText = `You have ${events.length} events in your calendar for ${search === 'specific date' ? specificDate : search}:\n\n`;
            const eventDescriptions: string[] = [];
            for (const event of events) {
                const startDate = moment(event.startDate).format('dddd, MMMM D, YYYY');
                const endDate = moment(event.endDate ?? (moment(event.startDate).add(1, 'hour').toISOString())); // If no end date, assume it's for 1 hour

                let prefix = '';
                if (search === 'specific date') prefix = `On ${startDate.split(',')[0]} at ${startDate.split(',')[1]} you have `;
                else prefix = '';

                let eventDescription = `${prefix}${event.title}${event.location ? ` at ${event.location}` : ' online'}`;
                if (event.allDay) eventDescription += ' that will go on for the whole day.';
                else {
                    const duration = endDate.diff(moment(event.startDate), 'minutes');
                    const hours = Math.floor(duration / 60);
                    const minutes = duration % 60;
                    if (hours > 0) eventDescription += ` for ${hours} hours and ${minutes} minutes`;
                    else eventDescription += ` for ${minutes} minutes`;
                }
                eventDescription += '.';

                if (event.attendees?.length) {
                    const attendees: string[] = [];
                    for (const attendee of event.attendees) {
                        if (attendee.name) attendees.push(`${attendee.name} (${attendee.email})`);
                        else attendees.push(`${attendee.email}`);
                    }
                    eventDescription += ` The attendees are ${attendees.join(', ')}.`;
                }

                eventDescription += this._formatEventDescription(event.description as string);
                eventDescriptions.push(eventDescription);
            }

            eventText += eventDescriptions.join('\n---\n');
            return eventText;
        } catch (e) {
            console.error(`Calendar Event Reading Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error reading the calendar.`;
        }
    },
    _searchTypeToDate: function (searchType: 'today' | 'tomorrow' | 'this week' | 'next week' | 'this month' | 'next month' | 'specific date', specificDate?: string) {
        switch (searchType) {
            case 'today':
                return {
                    startDate: moment().startOf('day').toISOString(),
                    endDate: moment().endOf('day').toISOString()
                };
            case 'tomorrow':
                return {
                    startDate: moment().add(1, 'day').startOf('day').toISOString(),
                    endDate: moment().add(1, 'day').endOf('day').toISOString()
                };
            case 'this week':
                return {
                    startDate: moment().startOf('week').toISOString(),
                    endDate: moment().endOf('week').toISOString()
                };
            case 'next week':
                return {
                    startDate: moment().add(1, 'week').startOf('week').toISOString(),
                    endDate: moment().add(1, 'week').endOf('week').toISOString()
                };
            case 'this month':
                return {
                    startDate: moment().startOf('month').toISOString(),
                    endDate: moment().endOf('month').toISOString()
                };
            case 'next month':
                return {
                    startDate: moment().add(1, 'month').startOf('month').toISOString(),
                    endDate: moment().add(1, 'month').endOf('month').toISOString()
                };
            case 'specific date':
                return {
                    startDate: moment(specificDate as string).startOf('day').toISOString(),
                    endDate: moment(specificDate as string).endOf('day').toISOString()
                };
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

        return !!descriptionContent ? `Event Description: ${descriptionContent}.` : '';
    }
} as const;