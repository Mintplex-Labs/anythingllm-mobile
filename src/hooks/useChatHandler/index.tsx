import WorkspaceThread, { type WorkspaceThreadType } from "@/database/models/WorkspaceThread";
import { type WorkspaceType } from "@/database/models/Workspace";
import { type LLMProvider } from "@/utils/AiProviders";
import { useState, useMemo, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import uiStore from "@/store/UIStore";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import { merge } from 'lodash';
import { ICompleteResponse, IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { parseStreamingChunksToResponse } from "./parser";
import { activateKeepAwake, deactivateKeepAwake } from "@/utils/keepAwake";

const SHOW_DEBUG_LOGS = true;

export interface ChatHandlerInterface {
    /** The current chat history for the workspace thread */
    chats: DynamicChatMessage[];
    /** Whether the chat history is loading */
    isLoadingChats: boolean;
    /** The error if the chat history fails to load */
    errorLoadingChats: Error | null;
    /** Whether the chat history can be scrolled */
    canScrollChatHistory: boolean;
    /** Fetch the chats from the database wrt to the thread that is available in the context */
    fetchChats: () => Promise<void>;
    /** Reset the chat history */
    reset: () => void;

    /** The current prompt for the workspace thread */
    prompt: string;
    /** Whether the prompt is disabled */
    promptDisabled: boolean;
    /** Set the prompt for the workspace thread with optional auto submit */
    setPrompt: (prompt: string, autoSubmit?: boolean) => void;
    /** Submit the prompt for the workspace thread - if no prompt is passed, use the current prompt state */
    submitPrompt: (prompt?: string) => void;
}

interface IChatHandlerInterfaceProps {
    workspace: WorkspaceType;
    thread: WorkspaceThreadType;
    llmProvider: LLMProvider;
}

export const CHAT_HANDLER_EVENTS = {
    SUBMIT_PROMPT: 'submit_prompt',
    SET_PROMPT: 'set_prompt',

    PROMPT_SUBMITTED: 'prompt_submitted',
    ASSISTANT_RESPONSE_COMPLETE: 'assistant_response_complete',
    DISABLE_PROMPT_INPUT: 'disable_prompt_input',
    ENABLE_PROMPT_INPUT: 'enable_prompt_input',
    RESET_CHAT: 'reset_chat',
}

function debug(text: string, ...args: any[]) {
    if (SHOW_DEBUG_LOGS) console.log(`\x1b[33m[ChatHandler]\x1b[0m ${text}`, ...args);
}

export function chatHandlerInterface({ workspace, thread, llmProvider }: IChatHandlerInterfaceProps): ChatHandlerInterface {
    const [chatsMap, setChatsMap] = useState<Map<string, DynamicChatMessage>>(new Map());
    const [prompt, _setPrompt] = useState('');
    const [isLoadingChats, setIsLoadingChats] = useState(true);
    const [errorLoadingChats, setErrorLoadingChats] = useState<Error | null>(null);
    const [_promptDisabled, _setPromptDisabled] = useState<boolean>(false);

    const fetchChats = useCallback(async () => {
        try {
            setIsLoadingChats(true);
            if (!thread.slug) return;
            const chats = await WorkspaceChat.find(
                [{ field: 'workspace_thread_slug', value: thread.slug }],
                [{ field: 'created_at', direction: 'desc' }]
            );
            setChatsMap(new Map(chats.map(chat => [chat.uuid, chat])));
            debug('Fetched chats', chats.length);
        } catch (err) {
            debug('Error fetching chats', err);
            setErrorLoadingChats(err as Error);
        } finally {
            setIsLoadingChats(false);
        }
    }, [thread.slug]);

    const disablePromptInput = useCallback(() => {
        _setPromptDisabled(true);
    }, [_setPromptDisabled]);

    const enablePromptInput = useCallback(() => {
        _setPromptDisabled(false);
    }, [_setPromptDisabled]);

    const reset = useCallback(async () => {
        debug('Resetting chat history');
        try {
            setIsLoadingChats(true);
            await WorkspaceChat.delete([{ field: 'workspace_thread_slug', value: thread.slug }]);
            setChatsMap(new Map());
        } catch (err) {
            debug('Error resetting chat history', err);
        } finally {
            setIsLoadingChats(false);
        }
    }, [thread.slug]);

    const chatsArray = useMemo(() => {
        return Array.from(chatsMap.values());
    }, [chatsMap]);

    const updateChat = useCallback((uuid: string, updates: Partial<any>) => {
        setChatsMap(prevMap => {
            const newMap = new Map(prevMap);
            const existingChat = newMap.get(uuid);
            if (existingChat) newMap.set(uuid, merge({}, existingChat, updates));
            return newMap;
        });
    }, []);

    const concludeChat = useCallback(async (uuid: string) => {
        let chatToSave: DynamicChatMessage | undefined;
        setChatsMap((prevMap) => {
            const existingChat = prevMap.get(uuid);
            if (!existingChat) {
                debug('Chat not found', uuid);
                return prevMap;
            }

            const newMap = new Map(prevMap);
            const updatedChat = { ...existingChat, isLoading: false };
            newMap.set(uuid, updatedChat);
            chatToSave = updatedChat; // Capture for database save
            return newMap;
        });

        // Emit the assistant response complete event
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE);

        // Save to database after state update
        if (!chatToSave) return debug('Failed to save chat to database!');
        await WorkspaceChat.create(chatToSave)
            .then(() => debug('Chat saved to database', uuid))
            .catch(err => debug('Error saving chat to database', err));
    }, []);

    /**
     * Add a new chat to the chat history and update the UI
     */
    const _addChat = useCallback((chat: DynamicChatMessage) => {
        debug('Creating new chat', chat.uuid);
        setChatsMap(prevMap => {
            const newMap = new Map(prevMap);
            newMap.set(chat.uuid as string, chat);
            return newMap;
        });
    }, []);

    /**
     * Process a chat and add it to the chat history
     * as well as kick off the LLM inference
     */
    const _processChat = useCallback(async (prompt: string) => {
        try {
            activateKeepAwake();
            const newChat = WorkspaceChat.newChatItem({ workspaceThreadSlug: thread.slug, prompt });
            _addChat(newChat as DynamicChatMessage);

            const currentChatsArray = Array.from(chatsMap.values()).concat([newChat as DynamicChatMessage]);
            let accumulator = '';
            await llmProvider.chat({
                messages: currentChatsArray,
                streaming: true,
                // onComplete: this is for non-streaming responses
                onStream: async (event: IStreamEvent, data: string | ICompleteResponse['metrics']): Promise<void> => {
                    debug('Stream event', event, data);
                    if (event === 'abort') throw new Error('Chat aborted');
                    if (event === 'complete') return await concludeChat(newChat.uuid as string);
                    if (typeof data !== 'string') return debug('Unhandled stream event', event, data);

                    const parsed = parseStreamingChunksToResponse(event, accumulator, data);
                    accumulator += data;

                    if (!parsed) return debug('No parsable content - skipping');
                    updateChat(newChat.uuid as string, { response: { textResponse: parsed.textResponse, thoughts: parsed.reasoningContent } });
                    return;
                },
            }).catch(err => {
                debug('Error processing chat', err);
                updateChat(newChat.uuid as string, { type: 'error', response: { textResponse: err.message || 'Error processing chat' } });
            });
        } catch (err) {
            debug('Error processing chat', err);
        } finally {
            deactivateKeepAwake();
        }
    }, [thread.slug, _addChat, chatsMap, updateChat, llmProvider, concludeChat]);

    const canScrollChatHistory = useMemo(() => {
        return !isLoadingChats && chatsMap.size > 0;
    }, [isLoadingChats, chatsMap]);

    const setPrompt = useCallback((promptToSet: string, autoSubmit: boolean = false) => {
        _setPrompt(promptToSet);
        if (autoSubmit) submitPrompt(promptToSet);
    }, [prompt]);

    const submitPrompt = useCallback(async (promptToSubmit?: string) => {
        if (!promptToSubmit) promptToSubmit = prompt;
        // Emit the submit prompt event to the UI store
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED);

        try {
            _setPrompt('');
            disablePromptInput();
            await _processChat(promptToSubmit);
        } catch (err) {
            debug('Error submitting prompt', err);
        } finally {
            enablePromptInput();
        }
    }, [prompt]);

    useEffect(() => {
        fetchChats();
    }, []);

    useEffect(() => {
        if (!workspace) return;
        llmProvider.attachWorkspaceToProvider(workspace);
    }, [workspace, llmProvider]);

    /**
     * Listen for events from the UI store to manage the prompt state
     */
    useEffect(() => {
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT, disablePromptInput);
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT, enablePromptInput);
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.RESET_CHAT, reset);
        return () => {
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.RESET_CHAT);
        }
    }, [reset, disablePromptInput, enablePromptInput]);

    const chatHandlerInterface = useMemo(() => {
        return {
            // Chat History
            chats: chatsArray,
            chatsMap,
            updateChat,
            isLoadingChats,
            errorLoadingChats,
            canScrollChatHistory,
            fetchChats,
            reset,

            // Prompt Management
            prompt,
            promptDisabled: _promptDisabled,
            setPrompt,
            submitPrompt,
        }
    }, [
        chatsMap,
        updateChat,
        isLoadingChats,
        errorLoadingChats,
        canScrollChatHistory,
        fetchChats,
        prompt,
        _promptDisabled,
        setPrompt,
        submitPrompt,
        chatsArray,
        reset,
    ]);

    return chatHandlerInterface;
}

const ChatHandlerContext = createContext<ChatHandlerInterface | null>(null);
export function ChatHandlerWrapper({ children, workspace, thread, llmProvider }: { children: React.ReactNode, workspace: WorkspaceType, thread: WorkspaceThreadType, llmProvider: LLMProvider }) {
    const chatHandler = chatHandlerInterface({ workspace, thread, llmProvider });
    return <ChatHandlerContext.Provider value={chatHandler}>{children}</ChatHandlerContext.Provider>;
}

export function useChatHandlerContext() {
    const chatHandler = useContext(ChatHandlerContext);
    if (!chatHandler) throw new Error('ChatHandlerContext not found');
    return chatHandler;
}