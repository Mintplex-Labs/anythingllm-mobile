import { ITextDraftAction } from "@/database/models/WorkspaceChat";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { safeJsonParse } from "@/utils/formatters";
import { looksLikePhoneNumber } from "@/utils/messaging";
import i18n from "@/i18n";

type Args = { recipient?: string; phone_number?: string; body?: string };

/**
 * Drafts a text message the user sends themselves. The assistant can never send it - the draft
 * is pushed into the turn as a `text_draft` action, which the chat renders as a card that opens
 * the user's messaging app (SMS, WhatsApp, Telegram, ...) with the draft filled in.
 */
export default {
    id: 'draftText',
    get name() { return i18n.t('tools.draft_text.name'); },
    get description() { return i18n.t('tools.draft_text.description'); },
    defaultEnabled: false,
    category: 'appConnections',
    definition: {
        type: 'function',
        function: {
            name: 'draft_text',
            description:
                'Draft a text message for the user to send from their own messaging app (SMS, WhatsApp, etc). ' +
                'You cannot send it - the user reviews the draft and sends it themselves.',
            parameters: {
                type: 'object',
                properties: {
                    recipient: {
                        type: 'string',
                        description: 'Who the message is for, as the user referred to them eg: "Mom" or "Sarah". Omit if unknown.',
                    },
                    phone_number: {
                        type: 'string',
                        description: 'The recipient\'s phone number, only if the user gave it. Include the country code when known eg: "+15551234567". Never guess one.',
                    },
                    body: {
                        type: 'string',
                        description: 'The full text of the message, written as the user would send it.',
                    },
                },
                required: ['body'],
            },
        },
    },
    config: {},
    execute: (args: Args | string, streamEmitter: (event: IStreamEvent, data: any) => void) => {
        try {
            const parsed: Args = (typeof args === 'string' ? safeJsonParse(args) : args) ?? {};
            const body = String(parsed.body ?? '').trim();
            if (!body) return `No body provided. No text was drafted.`;

            let recipientName = String(parsed.recipient ?? '').trim() || null;
            let phoneNumber = String(parsed.phone_number ?? '').trim() || null;
            // Models often put the number in `recipient` - move it where it belongs.
            if (recipientName && !phoneNumber && looksLikePhoneNumber(recipientName)) {
                phoneNumber = recipientName;
                recipientName = null;
            }
            if (phoneNumber && !looksLikePhoneNumber(phoneNumber)) phoneNumber = null;

            const who = recipientName ?? phoneNumber;
            streamEmitter('report_status', who ? i18n.t('tools.draft_text.status_drafting_to', { recipient: who }) : i18n.t('tools.draft_text.status_drafting'));
            streamEmitter('report_action', {
                type: 'text_draft',
                action: { recipientName, phoneNumber, body },
            } as ITextDraftAction);
            return 'The draft is shown to the user as a card they tap to open it in their messaging app and send it themselves. ' +
                'Do not repeat the message or say it was sent - briefly confirm the draft is ready.';
        } catch (e) {
            console.error(`Draft Text Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
            return `There was an error drafting the text.`;
        }
    },
} as const;
