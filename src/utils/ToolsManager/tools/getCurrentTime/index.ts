import moment from 'moment';

/**
 * The current date and time is deliberately a tool rather than a system prompt line: a
 * timestamp in the system prompt changes every minute, which rewrites the prefix ahead of the
 * whole conversation and defeats provider prompt caching (llama.cpp KV reuse, OpenAI and
 * Anthropic prefix caches) on every turn. The model calls this only when the time matters.
 */
export default {
    id: 'getTime',
    name: 'Get Time',
    description: 'Get the current date and time based on your device timezone.',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'get_current_datetime',
            description: 'Get the current date and time in the user\'s timezone. Call this whenever the answer depends on today\'s date, the day of the week, or the time of day (eg: greetings, scheduling, "tomorrow", "this weekend", how long until/since something).',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    config: {},
    execute: async () => {
        return moment().format('LLLL');
    },
} as const;
