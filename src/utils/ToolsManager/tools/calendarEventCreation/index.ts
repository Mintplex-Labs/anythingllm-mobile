import { ICalendarEventAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";

export default {
    id: 'calendarEventCreation',
    name: 'Calendar Event Creation',
    description: 'Use the assistant to create a calendar event for you.',
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'create_calendar_event',
            description: 'Use the assistant to create a calendar event for you.',
            parameters: {
                type: 'object',
                properties: {
                    beginTime: {
                        type: 'string',
                        description: 'The beginning time of the event in milliseconds since epoch',
                    },
                    endTime: {
                        type: 'string',
                        description: 'The ending time of the event in milliseconds since epoch',
                    },
                    title: {
                        type: 'string',
                        description: 'The title of the event',
                    },
                    eventLocation: {
                        type: 'string',
                        description: 'The location of the event (can be empty)',
                    },
                    description: {
                        type: 'string',
                        description: 'The description of the event (can be empty)',
                    },
                    allDay: {
                        type: 'boolean',
                        description: 'Whether the event is all day',
                    },
                },
                required: ['beginTime', 'endTime', 'title', 'eventLocation', 'description', 'allDay'],
            },
        },
    },
    config: {},
    execute: (args: { beginTime: number, endTime: number, title: string, eventLocation: string, description: string }, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const { beginTime, endTime, title, eventLocation, description, allDay = false } = typeof args === 'string' ? safeJsonParse(args) : args;
            if (!beginTime || !endTime || !title || !eventLocation || !description) return `No beginTime, endTime, title, eventLocation, or description provided. No calendar event was created.`;
            streamEmitter('report_action', {
                type: 'calendar_event_creation',
                action: {
                    beginTime: Number(beginTime),
                    endTime: Number(endTime),
                    title: title,
                    eventLocation: eventLocation ?? '',
                    description: description ?? '',
                    allDay: allDay,
                },
            } as ICalendarEventAction);
            return 'Calendar event created successfully.';
        } catch (e) {
            console.error(`Calendar Event Creation Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error creating the calendar event.`;
        }
    },
} as const;