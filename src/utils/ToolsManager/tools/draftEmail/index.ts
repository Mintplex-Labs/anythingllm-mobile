import { IEmailAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";

export default {
    id: 'draftEmail',
    name: 'Draft Email',
    description: 'Use the assistant to draft and email for you.',
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'draft_email',
            description: 'Use the assistant to draft and email for you. Includes the subject, body, and optional recipient.',
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
    execute: (args: { subject: string, body: string, to?: string }, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const { subject, body, to } = typeof args === 'string' ? safeJsonParse(args) : args;
            if (!subject || !body) return `No subject or body provided. No email was drafted.`;
            streamEmitter('report_action', {
                type: 'email',
                action: {
                    title: 'Open Draft Email',
                    link: `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
                },
            } as IEmailAction);
            return 'Email drafted successfully.';
        } catch (e) {
            console.error(`Draft Email Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error drafting the email.`;
        }
    },
} as const;