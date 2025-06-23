export default {
    id: 'draftEmail',
    name: 'Draft Email',
    description: 'Draft an email for the user',
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'draft_email',
            description: 'Draft an email for the user',
            parameters: {
                type: 'object',
                properties: {
                    subject: {
                        type: 'string',
                        description: 'The subject of the email',
                    },
                    body: {
                        type: 'string',
                        description: 'The body of the email',
                    },
                    to: {
                        type: 'string',
                        description: 'The email address of the recipient',
                    },
                },
                required: ['subject', 'body'],
            },
        },
    },
    config: {},
    execute: (args: any) => {
        console.log('Drafting email', args);
        return 'Email drafted';
    },
} as const;