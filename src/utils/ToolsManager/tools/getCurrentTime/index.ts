export default {
    id: 'getTime',
    name: 'Get Time',
    description: 'Get the current time based on your device.',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'get_current_time',
            description: 'Get the current time in the users timezone.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    config: {},
    execute: () => new Date().toLocaleTimeString(),
} as const;