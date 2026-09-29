import { IEmailDraftAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import { looksLikeEmailAddress, parseEmailAddresses } from "@/utils/messaging";
import i18n from "@/i18n";

type Args = { recipient?: string; to?: string | string[]; cc?: string | string[]; subject?: string; body?: string };

/**
 * Drafts an email the user sends themselves. The assistant can never send it - the draft is
 * pushed into the turn as an `email_draft` action, which the chat renders as a card that opens
 * the user's mail app (Gmail, Outlook, ...) on a compose screen with the draft filled in.
 */
export default {
    id: 'draftEmail',
    get name() { return i18n.t('tools.draft_email.name'); },
    get description() { return i18n.t('tools.draft_email.description'); },
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'draft_email',
            description:
                'Draft an email for the user to send from their own mail app (Gmail, Outlook, etc). ' +
                'You cannot send it - the user reviews the draft and sends it themselves.',
            parameters: {
                type: 'object',
                properties: {
                    recipient: {
                        type: 'string',
                        description: 'Who the email is for, as the user referred to them eg: "Sarah" or "the landlord". Omit if unknown.',
                    },
                    to: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Recipient email addresses, only ones the user gave. Never guess one.',
                    },
                    cc: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Addresses to CC, only if the user asked for it.',
                    },
                    subject: {
                        type: 'string',
                        description: 'A short, specific subject line.',
                    },
                    body: {
                        type: 'string',
                        description: 'The full email body in plain text (no markdown), including the greeting and sign-off.',
                    },
                },
                required: ['subject', 'body'],
            },
        },
    },
    config: {},
    execute: (args: Args | string, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const parsed: Args = (typeof args === 'string' ? safeJsonParse(args) : args) ?? {};
            const subject = String(parsed.subject ?? '').trim();
            const body = String(parsed.body ?? '').trim();
            if (!subject && !body) return `No subject or body provided. No email was drafted.`;

            let recipientName = String(parsed.recipient ?? '').trim() || null;
            const to = parseEmailAddresses(parsed.to);
            // Models often put the address in `recipient` - move it where it belongs.
            if (recipientName && looksLikeEmailAddress(recipientName)) {
                if (!to.includes(recipientName)) to.push(recipientName);
                recipientName = null;
            }
            const cc = parseEmailAddresses(parsed.cc).filter(address => !to.includes(address));

            streamEmitter('report_status', i18n.t('tools.draft_email.status_drafting', { subject: subject || i18n.t('chat.email_draft.no_subject') }));
            streamEmitter('report_action', {
                type: 'email_draft',
                action: { recipientName, to, cc, subject, body },
            } as IEmailDraftAction);
            return 'The draft is shown to the user as a card they tap to open it in their mail app and send it themselves. ' +
                'Do not repeat the email or say it was sent - briefly confirm the draft is ready.';
        } catch (e) {
            console.error(`Draft Email Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error drafting the email.`;
        }
    },
} as const;
