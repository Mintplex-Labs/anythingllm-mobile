import { ICalendarEventAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import { parseMeetingUrl, parseRecurrence, parseReminders, toTimestamp } from "@/utils/calendar";
import { parseEmailAddresses } from "@/utils/messaging";
import i18n from "@/i18n";

type Args = {
    beginTime?: string | number;
    endTime?: string | number;
    title?: string;
    eventLocation?: string;
    description?: string;
    allDay?: boolean | string;
    attendees?: string | string[];
    repeatFrequency?: string;
    repeatInterval?: number | string;
    repeatDays?: string | string[];
    repeatCount?: number | string;
    repeatUntil?: string;
    reminderMinutesBefore?: number | string | (number | string)[];
    url?: string;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Drafts a calendar event the user adds themselves. The assistant never writes to the calendar -
 * the event is pushed into the turn as a `calendar_event_creation` action, which the chat renders
 * as a card that opens the calendar app's new-event screen with it filled in.
 */
export default {
    id: 'calendarEventCreation',
    get name() { return i18n.t('tools.calendar_event_creation.name'); },
    get description() { return i18n.t('tools.calendar_event_creation.description'); },
    defaultEnabled: false,
    category: 'appConnections',
    group: 'calendar',
    definition: {
        type: 'function',
        function: {
            name: 'create_calendar_event',
            description:
                'Draft a calendar event for the user to add to their own calendar app. ' +
                'You cannot add it - the user reviews the event and saves it themselves.',
            parameters: {
                type: 'object',
                properties: {
                    beginTime: {
                        type: 'string',
                        description: 'When the event starts, as an ISO 8601 date-time in the user\'s local time eg: "2026-09-30T14:00:00". For all-day events use the start of the day.',
                    },
                    endTime: {
                        type: 'string',
                        description: 'When the event ends, same format as beginTime. Omit if unknown - it then lasts an hour.',
                    },
                    title: {
                        type: 'string',
                        description: 'A short title for the event',
                    },
                    eventLocation: {
                        type: 'string',
                        description: 'Where the event is. Omit if unknown.',
                    },
                    description: {
                        type: 'string',
                        description: 'Notes for the event in plain text. Omit if there are none.',
                    },
                    allDay: {
                        type: 'boolean',
                        description: 'Whether the event lasts the whole day',
                    },
                    attendees: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Email addresses to invite, only ones the user gave. Never guess one. Omit if none.',
                    },
                    repeatFrequency: {
                        type: 'string',
                        enum: ['daily', 'weekly', 'monthly', 'yearly'],
                        description: 'How often the event repeats. Omit for a one-off event.',
                    },
                    repeatInterval: {
                        type: 'integer',
                        description: 'Repeat every N periods eg: 2 with weekly is every other week. Omit for every period.',
                    },
                    repeatDays: {
                        type: 'array',
                        items: { type: 'string', enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] },
                        description: 'Weekly repeats only: the days it falls on eg: ["MO", "WE"]. Omit to use the start day.',
                    },
                    repeatCount: {
                        type: 'integer',
                        description: 'How many times it happens in total. Omit to repeat until repeatUntil, or forever.',
                    },
                    repeatUntil: {
                        type: 'string',
                        description: 'The last date it can happen on, ISO 8601 eg: "2026-12-31". Omit to repeat forever or repeatCount times.',
                    },
                    reminderMinutesBefore: {
                        type: 'array',
                        items: { type: 'integer' },
                        description: 'Reminders as minutes before the start eg: [30] or [1440, 60]. Only if the user asked. Omit to use their calendar default.',
                    },
                    url: {
                        type: 'string',
                        description: 'A meeting link (Zoom, Google Meet, Teams, ...) the user gave. Omit if none.',
                    },
                },
                required: ['beginTime', 'title'],
            },
        },
    },
    config: {},
    execute: (args: Args | string, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const parsed: Args = (typeof args === 'string' ? safeJsonParse(args) : args) ?? {};
            const title = String(parsed.title ?? '').trim();
            const beginTime = toTimestamp(parsed.beginTime);
            if (!title || beginTime === null) return `No title or valid beginTime provided. No calendar event was drafted.`;
            const endTime = toTimestamp(parsed.endTime);
            const allDay = parsed.allDay === true || parsed.allDay === 'true';

            // Every detail past the title and start is optional - anything unusable falls back to its default.
            const recurrence = parseRecurrence({
                frequency: parsed.repeatFrequency,
                interval: parsed.repeatInterval,
                days: parsed.repeatDays,
                count: parsed.repeatCount,
                until: parsed.repeatUntil,
            }, beginTime);

            streamEmitter('report_status', i18n.t('tools.calendar_event_creation.status_preparing', { title }));
            streamEmitter('report_action', {
                type: 'calendar_event_creation',
                action: {
                    beginTime,
                    endTime: endTime !== null && endTime > beginTime ? endTime : beginTime + ONE_HOUR_MS,
                    title,
                    eventLocation: String(parsed.eventLocation ?? '').trim(),
                    description: String(parsed.description ?? '').trim(),
                    allDay,
                    attendees: parseEmailAddresses(parsed.attendees),
                    recurrence,
                    reminderMinutes: parseReminders(parsed.reminderMinutesBefore),
                    url: parseMeetingUrl(parsed.url),
                },
            } as ICalendarEventAction);
            return 'The event is shown to the user as a card they tap to add it in their calendar app. ' +
                'Do not repeat the event details or say it was added - briefly confirm the event is ready to add.';
        } catch (e) {
            console.error(`Calendar Event Creation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error drafting the calendar event.`;
        }
    },
} as const;
