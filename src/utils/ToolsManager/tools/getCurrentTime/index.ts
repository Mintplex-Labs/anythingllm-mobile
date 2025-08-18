import moment from 'moment';

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
            description: 'Get the current date and time in the users timezone.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    config: {},
    execute: () => {
        return moment().format('LLLL');
    },
} as const;