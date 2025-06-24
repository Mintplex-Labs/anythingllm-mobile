import { ITextAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";

export default {
    id: 'draftText',
    name: 'Draft Text',
    description: 'Use the assistant to draft and text for you.',
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'draft_text',
            description: 'Use the assistant to draft and text for you.',
            parameters: {
                type: 'object',
                properties: {
                    recipient: {
                        type: 'string',
                        description: 'The phone number or name of the recipient if the number is unknown',
                    },
                    body: {
                        type: 'string',
                        description: 'The body of the text',
                    },
                },
                required: ['recipient', 'body'],
            },
        },
    },
    config: {},
    execute: (args: { recipient: string, body: string }, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const { recipient, body } = typeof args === 'string' ? safeJsonParse(args) : args;
            if (!body) return `No body provided. No text was drafted.`;
            streamEmitter('report_action', {
                type: 'sms',
                action: {
                    title: 'Open Draft Text',
                    link: `sms:${recipient ?? ''}?body=${encodeURIComponent(body)}`,
                },
            } as ITextAction);
            return 'Text drafted successfully.';
        } catch (e) {
            console.error(`Draft Text Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error drafting the email.`;
        }
    },
} as const;