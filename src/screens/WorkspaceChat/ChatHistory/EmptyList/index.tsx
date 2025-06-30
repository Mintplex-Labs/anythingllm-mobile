import { screenDimensions } from "@/utils/constants";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { CHAT_HANDLER_EVENTS, useChatHandlerContext } from "@/hooks/useChatHandler";
import LocationAgentTool from "@/utils/ToolsManager/tools/getLocation";
import { useEffect, useState } from "react";
import uiStore from "@/store/UIStore";
import { listProcessedFiles } from "@/utils/fs";

const noop = () => { };
const smartMessages = {
    hello: {
        text: 'Hello, what can you help me with?',
        onClick: {
            before: noop,
            after: noop
        },
    },
    research: {
        text: async function () {
            const location = await LocationAgentTool._getLocation();
            if (!location) return null;
            return `Look online for some fun things to do in ${location?.city}, ${location?.regionName}`;
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
            if (isWeekend || (isPast5PM && tomorrowIdx > 6)) return 'What is on my calendar for Monday?';
            if (isPast5PM) return `What is on my calendar for tomorrow?`;
            return 'What is on my calendar for today?';
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
        text: 'Draft a sales email to John Doe about the benefits of local AI agents',
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
        text: async function () {
            const mode = ['filename', 'url'];
            const randomMode = mode[Math.floor(Math.random() * mode.length)];
            let text = 'Summarize paulgraham.com/foundermode.html';
            if (randomMode === 'url') return text;

            const files = await listProcessedFiles();
            if (randomMode === 'filename' && files.length) {
                const randomFile = files[Math.floor(Math.random() * files.length)];
                text = `Summarize ${randomFile.name}`;
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

export default function EmptyList({ height }: { height: number }) {
    const [messages, setMessages] = useState<{ text: string, onClick: () => void }[]>([]);
    const [loading, setLoading] = useState(false);
    async function getRandomMessages(limit = 3) {
        const messages = [];
        const availableMessages = { ...smartMessages };
        for (let i = 0; i < Object.keys(smartMessages).length; i++) {
            const keys = Object.keys(availableMessages);
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const message = availableMessages[randomKey as keyof typeof availableMessages]
            const text = typeof message.text === 'function' ? await message.text() : message.text;
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
    return (
        <View style={{ height, gap: 14 }} className='flex flex-col items-center justify-center'>
            <ActivityIndicator size="large" color="#888" />
            <Text style={{ color: '#888' }} className='text-center'>Loading chat history...</Text>
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