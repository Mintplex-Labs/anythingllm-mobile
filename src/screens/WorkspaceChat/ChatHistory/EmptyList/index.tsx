import { screenDimensions } from "@/utils/constants";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler";
import { type IAttachment } from "@/utils/AiProviders/baseOpenAILikeProvider";
import LocationAgentTool from "@/utils/ToolsManager/tools/getLocation";
import { useEffect, useState } from "react";
import uiStore from "@/store/UIStore";
import Document from "@/database/models/Document";
import { useRoute } from "@react-navigation/native";
import { useAttachmentsContext, type Attachment } from "@/hooks/useAttachments";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

const noop = () => { };
const smartMessages = {
    hello: {
        text: () => i18n.t('chat.suggestions.hello'),
        onClick: {
            before: noop,
            after: noop
        },
    },
    research: {
        text: async function () {
            const location = await LocationAgentTool._getLocation();
            if (!location) return null;
            return i18n.t('chat.suggestions.research', { city: location?.city, region: location?.regionName });
        },
        onClick: {
            before: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, webSearch: true } as never);
            },
            after: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, webSearch: false } as never);
            }
        }
    },
    calendar: {
        text: function () {
            const date = new Date();
            const isWeekend = [0, 6].includes(date.getDay());
            const isPast5PM = date.getHours() >= 17;
            const tomorrowIdx = date.getDay() + 1;
            if (isWeekend || (isPast5PM && tomorrowIdx > 6)) return i18n.t('chat.suggestions.calendar_monday');
            if (isPast5PM) return i18n.t('chat.suggestions.calendar_tomorrow');
            return i18n.t('chat.suggestions.calendar_today');
        },
        onClick: {
            before: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, calendarEventReading: true, getTime: true } as never);
            },
            after: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, calendarEventReading: false, getTime: false } as never);
            }
        },
    },
    email: {
        text: () => i18n.t('chat.suggestions.email'),
        onClick: {
            before: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, draftEmail: true } as never);
            },
            after: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, draftEmail: false } as never);
            }
        }
    },
    summarize: {
        text: async function (workspaceSlug?: string) {
            const mode = ['filename', 'url'];
            const randomMode = mode[Math.floor(Math.random() * mode.length)];
            let text = i18n.t('chat.suggestions.summarize_example');
            if (randomMode === 'url' || !workspaceSlug) return text;

            // Only suggest files that were uploaded to _this_ workspace - never whatever is on disk.
            const documents: { name: string }[] = await Document.find([{ field: 'workspace_slug', value: workspaceSlug }]);
            if (documents.length) {
                const randomDoc = documents[Math.floor(Math.random() * documents.length)];
                text = i18n.t('chat.suggestions.summarize_file', { name: randomDoc.name });
            }
            return text;
        },
        onClick: {
            before: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, summarize: true } as never);
            },
            after: async function () {
                const enabledTools = await uiStore.getFromStorage('tools', {});
                await uiStore.setToStorage('tools', { ...enabledTools, summarize: false } as never);
            }
        }
    }
};

/**
 * One-tap prompts for content another app shared into this empty thread (see utils/SharedContent):
 * the attachment stays on the prompt, only the question is filled in. One suggestion per kind present.
 */
function suggestionsForAttachments(attachments: Attachment[]): string[] {
    const websites = attachments.filter((a) => a.kind === 'document' && a.origin === 'url').length;
    const documents = attachments.filter((a) => a.kind === 'document' && a.origin !== 'url').length;
    const images = attachments.filter((a) => a.kind === 'image').length;
    const suggestions: string[] = [];
    if (websites) suggestions.push(i18n.t('chat.suggestions.summarize_websites', { count: websites }));
    if (documents) suggestions.push(i18n.t('chat.suggestions.summarize_documents', { count: documents }));
    if (images) suggestions.push(i18n.t('chat.suggestions.explain_images', { count: images }));
    return suggestions;
}

export default function EmptyList({ height }: { height: number }) {
    const attachmentHandler = useAttachmentsContext();
    // Something was shared or attached before the first message: suggest what to do with it instead
    // of the generic starters.
    if (attachmentHandler && attachmentHandler.attachments.length > 0) {
        return <AttachedSuggestions height={height} attachments={attachmentHandler.attachments} imageAttachments={attachmentHandler.imageAttachments} />;
    }
    return <RandomSuggestions height={height} />;
}

function AttachedSuggestions({ height, attachments, imageAttachments }: { height: number; attachments: Attachment[]; imageAttachments: IAttachment[] }) {
    const chatHandler = useChatHandlerContext();
    const suggestions = suggestionsForAttachments(attachments);
    // Documents are still being parsed (and embedded) - sending now would leave them out of the answer.
    const processing = attachments.some((a) => a.processing);
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            {processing && <ActivityIndicator size="small" color="#888" />}
            {suggestions.map((text) => (
                <TouchableOpacity
                    key={text}
                    disabled={processing || chatHandler.promptDisabled}
                    onPress={() => chatHandler.submitPrompt(text, imageAttachments)}
                    style={{ width: screenDimensions.width / 1.6, paddingVertical: 10, paddingHorizontal: 8, opacity: processing ? 0.5 : 1 }}
                    className="bg-white/10 rounded-lg">
                    <Text className='text-white text-center'>{text}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

function RandomSuggestions({ height }: { height: number }) {
    // Same route params the chat screen reads - the workspace whose empty thread we are showing
    const { wsSlug } = (useRoute().params ?? {}) as { wsSlug?: string };
    const [messages, setMessages] = useState<{ text: string, onClick: () => void }[]>([]);
    const [loading, setLoading] = useState(false);
    async function getRandomMessages(limit = 3) {
        const messages = [];
        const availableMessages = { ...smartMessages };
        for (let i = 0; i < Object.keys(smartMessages).length; i++) {
            const keys = Object.keys(availableMessages);
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const message = availableMessages[randomKey as keyof typeof availableMessages]
            const text = typeof message.text === 'function' ? await (message.text as (slug?: string) => any)(wsSlug) : message.text;
            if (!!text) messages.push({ text, onClick: message.onClick } as never);
            delete availableMessages[randomKey];
            if (messages.length >= limit) break;
        }
        setMessages(messages);
    }

    useEffect(() => {
        setLoading(true);
        getRandomMessages().then(() => setLoading(false));
    }, []);

    if (loading) return <EmptyListLoading height={height} />;
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            {messages.map((message, index) => <DefaultMessage key={index} item={message as never} />)}
        </View>
    )
}

export function EmptyListLoading({ height }: { height: number }) {
    const { t } = useTranslation();
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            <ActivityIndicator size="large" color="#888" />
            <Text style={{ color: '#888' }} className='text-center'>{t('chat.loading_history')}</Text>
        </View>
    )
}

function DefaultMessage({ item }: { item: { text: string, onClick: { before: () => void, after: () => void } } }) {
    const chatHandler = useChatHandlerContext();

    function onPress() {
        item.onClick.before();
        chatHandler.setPrompt(item.text, true);
        const listener = uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE, () => {
            console.log("Assistant response complete - running default message after hook.");
            item.onClick.after();
            listener.remove();
        });
    }

    return (
        <TouchableOpacity onPress={onPress} style={{ width: screenDimensions.width / 1.6, paddingVertical: 10, paddingHorizontal: 8 }} className="bg-white/10 rounded-lg">
            <Text className='text-white text-center'>{item.text}</Text>
        </TouchableOpacity>
    )
}