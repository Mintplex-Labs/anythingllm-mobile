import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import RNCalendarEvents, { CalendarEventReadable } from "react-native-calendar-events";
import moment from 'moment';

export default {
    id: 'calendarEventReading',
    name: 'Read Calendar',
    description: 'Use the assistant to read your calendar events.',
    defaultEnabled: false,
    category: 'appConnections',
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

            const canRead = await RNCalendarEvents.checkPermissions();
            if (['denied', 'restricted', 'undetermined'].includes(canRead)) {
                const granted = await RNCalendarEvents.requestPermissions(true);
                if (!granted) return 'Calendar permissions not granted. Please grant permissions to read your calendar events.';
            }

            console.log('Fetching events from', startDate, 'to', endDate);
            const events = await RNCalendarEvents.fetchAllEvents(startDate, endDate);
            if (!events) return 'No calendar events found for the given time range.';

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
            console.error(`Calendar Event Creation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the calendar event.`;
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