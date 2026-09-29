import { screenDimensions } from "@/utils/constants";
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, StyleSheet } from "react-native";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler";
import { type IAttachment } from "@/utils/AiProviders/baseOpenAILikeProvider";
import LocationAgentTool from "@/utils/ToolsManager/tools/getLocation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import uiStore from "@/store/UIStore";
import Document from "@/database/models/Document";
import { useRoute } from "@react-navigation/native";
import { useAttachmentsContext, type Attachment } from "@/hooks/useAttachments";
import { useTranslation } from "react-i18next";
import i18n, { tKey } from "@/i18n";
import { fontStyles } from "@/utils/theme";
import { CalendarBlank, ChatCircleDots, EnvelopeSimple, FileText, Globe, Image as ImageIcon, type IconProps } from "phosphor-react-native";

const noop = () => { };
const smartMessages = {
    hello: {
        icon: ChatCircleDots,
        text: () => i18n.t('chat.suggestions.hello'),
        onClick: {
            before: noop,
            after: noop
        },
    },
    research: {
        icon: Globe,
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
        icon: CalendarBlank,
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
        icon: EnvelopeSimple,
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
        icon: FileText,
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

// Short, friendly openers shown above the suggestions - one is picked per empty thread.
// Keep this list small: every entry has to be translated.
const GREETINGS = [
    tKey('chat.greetings.working_on'),
    tKey('chat.greetings.noodle'),
    tKey('chat.greetings.on_your_mind'),
    tKey('chat.greetings.where_to_start'),
    tKey('chat.greetings.ready'),
    tKey('chat.greetings.think_it_through'),
];

const SUGGESTION_LIMIT = 3;
const ROW_MIN_HEIGHT = 48;
const CONTENT_WIDTH = Math.min(screenDimensions.width - 48, 420);
const COLORS = {
    divider: 'rgba(255,255,255,0.1)',
    icon: 'rgba(255,255,255,0.45)',
    text: 'rgba(255,255,255,0.8)',
};

type Suggestion = { text: string; icon: ComponentType<IconProps>; onPress: () => void };

/**
 * One-tap prompts for content another app shared into this empty thread (see utils/SharedContent):
 * the attachment stays on the prompt, only the question is filled in. One suggestion per kind present.
 */
function suggestionsForAttachments(attachments: Attachment[]): { text: string; icon: ComponentType<IconProps> }[] {
    const websites = attachments.filter((a) => a.kind === 'document' && a.origin === 'url').length;
    const documents = attachments.filter((a) => a.kind === 'document' && a.origin !== 'url').length;
    const images = attachments.filter((a) => a.kind === 'image').length;
    const suggestions: { text: string; icon: ComponentType<IconProps> }[] = [];
    if (websites) suggestions.push({ text: i18n.t('chat.suggestions.summarize_websites', { count: websites }), icon: Globe });
    if (documents) suggestions.push({ text: i18n.t('chat.suggestions.summarize_documents', { count: documents }), icon: FileText });
    if (images) suggestions.push({ text: i18n.t('chat.suggestions.explain_images', { count: images }), icon: ImageIcon });
    return suggestions;
}

export default function EmptyList({ height }: { height: number }) {
    const { t } = useTranslation();
    const attachmentHandler = useAttachmentsContext();
    // Picked once so the greeting doesn't change as attachments come and go.
    const [greetingKey] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    const hasAttachments = !!attachmentHandler && attachmentHandler.attachments.length > 0;

    return (
        <View style={{ height }} className='items-center justify-center'>
            <View style={{ width: CONTENT_WIDTH }}>
                <Text style={[fontStyles.display, styles.greeting]}>{t(greetingKey)}</Text>
                {/* Something was shared or attached before the first message: suggest what to do with it
                    instead of the generic starters. */}
                {hasAttachments
                    ? <AttachedSuggestions attachments={attachmentHandler.attachments} imageAttachments={attachmentHandler.imageAttachments} />
                    : <RandomSuggestions />}
            </View>
        </View>
    );
}

function AttachedSuggestions({ attachments, imageAttachments }: { attachments: Attachment[]; imageAttachments: IAttachment[] }) {
    const chatHandler = useChatHandlerContext();
    // Documents are still being parsed (and embedded) - sending now would leave them out of the answer.
    const processing = attachments.some((a) => a.processing);
    const suggestions: Suggestion[] = suggestionsForAttachments(attachments).map((s) => ({
        ...s,
        onPress: () => chatHandler.submitPrompt(s.text, imageAttachments),
    }));
    return (
        <View>
            <SuggestionList suggestions={suggestions} disabled={processing || chatHandler.promptDisabled} />
            {processing && <ActivityIndicator style={{ marginTop: 12 }} size="small" color="#888" />}
        </View>
    );
}

function RandomSuggestions() {
    // Same route params the chat screen reads - the workspace whose empty thread we are showing
    const { wsSlug } = (useRoute().params ?? {}) as { wsSlug?: string };
    const chatHandler = useChatHandlerContext();
    const [messages, setMessages] = useState<{ text: string; icon: ComponentType<IconProps>; onClick: { before: () => void; after: () => void } }[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const picked = [];
            const availableMessages = { ...smartMessages };
            for (let i = 0; i < Object.keys(smartMessages).length; i++) {
                const keys = Object.keys(availableMessages);
                const randomKey = keys[Math.floor(Math.random() * keys.length)] as keyof typeof availableMessages;
                const message = availableMessages[randomKey];
                const text = typeof message.text === 'function' ? await (message.text as (slug?: string) => any)(wsSlug) : message.text;
                if (text) picked.push({ text, icon: message.icon, onClick: message.onClick } as never);
                delete availableMessages[randomKey];
                if (picked.length >= SUGGESTION_LIMIT) break;
            }
            if (!cancelled) setMessages(picked);
        })();
        return () => { cancelled = true; };
    }, [wsSlug]);

    function onPress(item: NonNullable<typeof messages>[number]) {
        item.onClick.before();
        chatHandler.setPrompt(item.text, true);
        const listener = uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE, () => {
            console.log("Assistant response complete - running default message after hook.");
            item.onClick.after();
            listener.remove();
        });
    }

    // Reserve the rows' space while suggestions resolve (location lookup can be slow) so the
    // greeting doesn't jump when they appear.
    return (
        <View style={{ minHeight: SUGGESTION_LIMIT * ROW_MIN_HEIGHT }}>
            {messages && (
                <SuggestionList suggestions={messages.map((m) => ({ text: m.text, icon: m.icon, onPress: () => onPress(m) }))} />
            )}
        </View>
    );
}

function SuggestionList({ suggestions, disabled = false }: { suggestions: Suggestion[]; disabled?: boolean }) {
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }, [opacity]);

    return (
        <Animated.View style={{ opacity }}>
            {suggestions.map((suggestion, index) => {
                const Icon = suggestion.icon;
                return (
                    // NativeWind's Pressable wrapper drops function-form `style`, so keep this static.
                    <TouchableOpacity
                        key={suggestion.text}
                        disabled={disabled}
                        onPress={suggestion.onPress}
                        activeOpacity={0.6}
                        style={[styles.row, index > 0 && styles.rowDivider, disabled && styles.rowDisabled]}>
                        <Icon size={18} color={COLORS.icon} />
                        <Text style={styles.rowText} numberOfLines={2}>{suggestion.text}</Text>
                    </TouchableOpacity>
                );
            })}
        </Animated.View>
    );
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

const styles = StyleSheet.create({
    greeting: { color: 'white', fontSize: 30, lineHeight: 38, textAlign: 'center', marginBottom: 28 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: ROW_MIN_HEIGHT, paddingVertical: 12, paddingHorizontal: 6 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.divider },
    rowDisabled: { opacity: 0.5 },
    rowText: { flex: 1, color: COLORS.text, fontSize: 15, lineHeight: 20 },
});

