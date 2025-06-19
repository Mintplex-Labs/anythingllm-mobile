import { WorkspaceThreadType } from "@/database/models/WorkspaceThread";
import { useEffect, useState } from "react";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";

const DUMMY_CHATS: DynamicChatMessage[] = [
    {
        uuid: '1',
        workspaceThread: { slug: '1', name: 'Test Thread', workspaceSlug: '1', createdAt: Date.now() } as WorkspaceThreadType,
        prompt: 'Hello, how are you?'.repeat(10).split('?').map((v, index) => {
            if (index % Math.random() < 0.5) return v;
            return `${v}?\n\n`;
        }).join(''),
        response: {
            textResponse: 'I am good, thank you!'.repeat(100),
            thoughts: 'This is a thought\n'.repeat(10),
            toolCalls: [],
            metrics: {},
            attachments: [],
            citations: [
                {
                    type: 'document',
                    document: {
                        uuid: '1',
                        name: 'Test Document',
                        chunk: 'This is a citation',
                        score: 0.9,
                    }
                },
                {
                    type: 'web-search',
                    reference: {
                        url: 'https://www.google.com',
                        content: 'This is a citation',
                    }
                }
            ],
        },
        createdAt: Date.now(),
        isLoading: false,
    },
    {
        uuid: '2',
        workspaceThread: { slug: '1', name: 'Test Thread', workspaceSlug: '1', createdAt: Date.now() } as WorkspaceThreadType,
        prompt: 'Second prompt',
        response: {
            textResponse: 'Second response',
            thoughts: '',
            toolCalls: [],
            metrics: {},
            attachments: [],
            citations: [],
        },
        createdAt: Date.now(),
        isLoading: false,
    },
];

export default function useWorkspaceThreadChats(thread: WorkspaceThreadType) {
    const [chats, setChats] = useState<DynamicChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function fetchChats() {
            try {
                if (!thread.slug) return;
                const chats = DUMMY_CHATS; //await WorkspaceChat.find([{ field: 'workspace_thread_slug', value: thread.slug }]);
                setChats(chats);
                setIsLoading(false);
            } catch (err) {
                setError(err as Error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchChats();
    }, [thread.slug]);

    return { chats, isLoading, error };
}

