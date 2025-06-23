export default {
    id: 'getLocation',
    name: 'Get Location',
    description: 'Get your approximate location. This will return the city, state, and country. ',
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