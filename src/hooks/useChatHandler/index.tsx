import { type WorkspaceThreadType } from "@/database/models/WorkspaceThread";
import { type WorkspaceType } from "@/database/models/Workspace";
import { type LLMProvider } from "@/utils/AiProviders";
import { useState, useMemo, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import uiStore from "@/store/UIStore";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import { IStreamEvent, IStreamResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { activateKeepAwake, deactivateKeepAwake } from "@/utils/keepAwake";
import { Keyboard } from "react-native";
import DelegatedProvider from "@/utils/AiProviders/delegatedProvider";
import AwaitableAlert from "@/components/AwaitableAlert";
import Telemetry from "@/utils/Telemetry";
import AssistantTurn from "./turn";

const SHOW_DEBUG_LOGS = true;

/**
 * Minimum gap between UI publishes while a reply streams. Tokens can arrive far
 * faster than a phone can re-layout markdown, so events are folded into the
 * working turn and the chat list only sees a snapshot every window. Turn
 * boundaries (tool calls, statuses, completion) bypass the window.
 */
const STREAM_FLUSH_INTERVAL_MS = 60;

/**
 * Everything the prompt input and action sheets need. Deliberately excludes the
 * chat list so typing in the prompt never re-renders the history.
 */
export interface ChatHandlerInterface {
    /** Whether the chat is currently working (could be streaming or not) */
    isWorking: boolean;
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
    /** Whether the chat workspace/thread is remote */
    isRemote: boolean;
}

/**
 * Everything the chat list needs. Changes only when history changes, so the
 * list is isolated from prompt keystrokes and other input-side state.
 */
export interface ChatHistoryInterface {
    /** The current chat history for the workspace thread */
    chats: DynamicChatMessage[];
    /** Whether the chat history is loading */
    isLoadingChats: boolean;
    /** The error if the chat history fails to load */
    errorLoadingChats: Error | null;
    /** Whether the chat history can be scrolled */
    canScrollChatHistory: boolean;
    /** Whether a reply is being generated */
    isWorking: boolean;
    /** Fetch the chats from the database wrt to the thread that is available in the context */
    fetchChats: () => Promise<void>;
}

interface IChatHandlerInterfaceProps {
    workspace: WorkspaceType;
    thread: WorkspaceThreadType;
    llmProvider: LLMProvider;
}

export const CHAT_HANDLER_EVENTS = {
    SUBMIT_PROMPT: 'submit_prompt',
    SET_PROMPT: 'set_prompt',
    CLEAR_ATTACHMENTS: 'clear_attachments',

    PROMPT_SUBMITTED: 'prompt_submitted',
    ASSISTANT_RESPONSE_COMPLETE: 'assistant_response_complete',
    DISABLE_PROMPT_INPUT: 'disable_prompt_input',
    ENABLE_PROMPT_INPUT: 'enable_prompt_input',
    RESET_CHAT: 'reset_chat',
    NEW_CHAT_STARTED: 'new_chat_started',
}

function debug(text: string, ...args: any[]) {
    if (SHOW_DEBUG_LOGS) console.log(`\x1b[33m[ChatHandler]\x1b[0m ${text}`, ...args);
}

function useChatHandler({ workspace, thread, llmProvider }: IChatHandlerInterfaceProps): { handler: ChatHandlerInterface, history: ChatHistoryInterface } {
    const [chatsMap, setChatsMap] = useState<Map<string, DynamicChatMessage>>(new Map());

    const [prompt, _setPrompt] = useState('');
    const [isLoadingChats, setIsLoadingChats] = useState(true);
    const [errorLoadingChats, setErrorLoadingChats] = useState<Error | null>(null);
    const [_promptDisabled, _setPromptDisabled] = useState<boolean>(false);
    const [isWorking, setIsWorking] = useState<boolean>(false);
    const [isRemote] = useState<boolean>(!!(workspace?.isRemote || thread?.isRemote));

    // Keep the latest chatsMap in a ref to avoid stale closures inside callbacks
    const chatsMapRef = useRef(chatsMap);
    useEffect(() => {
        chatsMapRef.current = chatsMap;
    }, [chatsMap]);

    const upsertChat = useCallback((chat: DynamicChatMessage) => {
        setChatsMap((prevMap) => {
            const newMap = new Map(prevMap);
            newMap.set(chat.uuid as string, chat);
            return newMap;
        });
    }, []);

    const fetchChats = useCallback(async () => {
        try {
            setIsLoadingChats(true);
            if (!thread?.slug) return;
            const chats = await WorkspaceChat.find(
                [{ field: 'workspace_thread_slug', value: thread.slug }],
                [{ field: 'created_at', direction: 'asc' }]
            );
            setChatsMap(new Map(chats.map(chat => [chat.uuid, { ...chat, isLoading: false }])));
            debug('Fetched chats', chats.length);
        } catch (err) {
            debug('Error fetching chats', err);
            setErrorLoadingChats(err as Error);
        } finally {
            setIsLoadingChats(false);
        }
    }, [thread?.slug]);

    const disablePromptInput = useCallback(() => {
        _setPromptDisabled(true);
    }, []);

    const enablePromptInput = useCallback(() => {
        _setPromptDisabled(false);
    }, []);

    const reset = useCallback(async () => {
        debug('Resetting chat history');
        try {
            setIsLoadingChats(true);
            setChatsMap(new Map());
            await WorkspaceChat.delete([{ field: 'workspace_thread_slug', value: thread.slug }]);
            if (isRemote) await DelegatedProvider.sendCommand(workspace.remoteConfig, 'reset-chat', { workspaceSlug: workspace.remoteConfig.slug, threadSlug: thread.remoteConfig.slug });
        } catch (err) {
            debug('Error resetting chat history', err);
        } finally {
            setIsLoadingChats(false);
        }
    }, [thread, workspace, isRemote]);

    const chatsArray = useMemo(() => {
        return Array.from(chatsMap.values());
    }, [chatsMap]);

    const concludeChat = useCallback(async (turn: AssistantTurn) => {
        const chatToSave = turn.finalize();
        upsertChat(chatToSave);

        // Emit the assistant response complete event
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE, { uuid: turn.uuid });

        await WorkspaceChat.create(chatToSave)
            .then(() => debug('Chat saved to database', chatToSave.uuid))
            .catch(err => debug('Error saving chat to database', err))
            .finally(() => {
                Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.CHAT_COMPLETED, {
                    llmProvider: llmProvider.name,
                    llmModel: llmProvider.model,
                });
            });
    }, [upsertChat, llmProvider]);

    /**
     * Process a chat and add it to the chat history
     * as well as kick off the LLM inference
     */
    const _processChat = useCallback(async (prompt: string) => {
        const newChat = WorkspaceChat.newChatItem({ workspaceThreadSlug: thread.slug, prompt }) as DynamicChatMessage;
        const turn = new AssistantTurn(newChat);

        // Throttled publisher - see STREAM_FLUSH_INTERVAL_MS.
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = null;
            upsertChat(turn.snapshot());
        };
        const scheduleFlush = (immediate: boolean) => {
            if (immediate) return flush();
            if (flushTimer) return;
            flushTimer = setTimeout(flush, STREAM_FLUSH_INTERVAL_MS);
        };

        try {
            activateKeepAwake();
            debug('Creating new chat', turn.uuid);
            upsertChat(turn.snapshot());
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.NEW_CHAT_STARTED, { uuid: turn.uuid });

            const messageHistory = Array.from(chatsMapRef.current.values()).concat([newChat]);
            const handleStreamEvent = (event: IStreamEvent, data: IStreamResponse) => {
                const { changed, immediate } = turn.applyEvent(event, data);
                if (changed) scheduleFlush(immediate);
            };

            // Establish the caller as the local provider
            // If the workspace is remote and reachable, we will update
            // the caller to the delegated provider. If the remote provider
            // is non reachable, we will ask the user to confirm.
            let caller = () => llmProvider.chat({
                messages: messageHistory,
                streaming: true,
                onComplete: (response) => debug('Unexpected non-streaming completion', response),
                onStream: handleStreamEvent,
            }) as Promise<any>;

            if (isRemote) {
                const config = {
                    connectionUrl: workspace.remoteConfig.connectionUrl,
                    deviceToken: workspace.remoteConfig.deviceToken,
                    workspaceSlug: workspace.remoteConfig.slug,
                    threadSlug: thread.remoteConfig.slug,
                    onStream: handleStreamEvent,
                    message: prompt,
                }

                const validConfig = await DelegatedProvider.validateConfig(config);
                if (validConfig) caller = () => (new DelegatedProvider()).streamChat(config)
                else {
                    const continueLocally = await AwaitableAlert(
                        "Remote server is not reachable",
                        "We cannot reach your instance currently. Do you want to continue this conversation locally?",
                        { text: 'No, cancel', style: 'cancel' },
                        { text: 'Yes, continue locally', style: 'default' },
                    );
                    if (!continueLocally) throw new Error('Remote server is not reachable - chat not sent.');
                }
            }

            await caller().catch(err => {
                debug('Error processing chat', err);
                turn.fail(err?.message || 'Error processing chat');
            }).finally(async () => {
                if (flushTimer) clearTimeout(flushTimer);
                flushTimer = null;
                await concludeChat(turn);
            });
        } catch (err) {
            debug('Error processing chat', err);
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = null;
            turn.fail((err as Error).message || 'Error processing chat');
            upsertChat(turn.snapshot());
        } finally {
            deactivateKeepAwake();
        }
    }, [thread.slug, upsertChat, llmProvider, concludeChat, isRemote, workspace]);

    const canScrollChatHistory = useMemo(() => {
        return !isLoadingChats && chatsArray.length > 0;
    }, [isLoadingChats, chatsArray]);

    const submitPrompt = useCallback(async (promptToSubmit?: string) => {
        if (!promptToSubmit) promptToSubmit = prompt;
        // Emit the submit prompt event to the UI store
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED);

        try {
            _setPrompt('');
            disablePromptInput();
            setIsWorking(true);
            await _processChat(promptToSubmit);
        } catch (err) {
            debug('Error submitting prompt', err);
        } finally {
            enablePromptInput();
            setIsWorking(false);
        }
    }, [prompt, _processChat, disablePromptInput, enablePromptInput]);

    const setPrompt = useCallback((promptToSet: string, autoSubmit: boolean = false) => {
        _setPrompt(promptToSet);
        if (autoSubmit) submitPrompt(promptToSet);
    }, [submitPrompt]);

    const hideKeyboard = useCallback(() => {
        Keyboard.dismiss();
    }, []);

    useEffect(() => {
        fetchChats();
        // On initial load, if a model is downloading, disable the prompt input to prevent crashes
        if (uiStore.session.has('@downloadInProgress')) disablePromptInput();
    }, []);

    useEffect(() => {
        if (!workspace) return;
        if (!llmProvider) return console.error('No LLM provider found - this should not happen and will crash');
        llmProvider.attachWorkspaceToProvider(workspace);
    }, [workspace, llmProvider]);

    /**
     * Listen for events from the UI store to manage the prompt state
     */
    useEffect(() => {
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT, disablePromptInput);
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT, enablePromptInput);
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.RESET_CHAT, reset);
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED, hideKeyboard);
        uiStore.emitter.addListener(uiStore.globalEvents.MODEL_DOWNLOAD_STARTED, disablePromptInput);
        uiStore.emitter.addListener(uiStore.globalEvents.MODEL_DOWNLOAD_COMPLETE, enablePromptInput);
        return () => {
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.RESET_CHAT);
            uiStore.emitter.removeAllListeners(uiStore.globalEvents.MODEL_DOWNLOAD_STARTED);
            uiStore.emitter.removeAllListeners(uiStore.globalEvents.MODEL_DOWNLOAD_COMPLETE);
        }
    }, [reset, disablePromptInput, enablePromptInput]);

    const handler = useMemo<ChatHandlerInterface>(() => ({
        isWorking,
        fetchChats,
        reset,
        prompt,
        promptDisabled: _promptDisabled,
        setPrompt,
        submitPrompt,
        isRemote,
    }), [isWorking, fetchChats, reset, prompt, _promptDisabled, setPrompt, submitPrompt, isRemote]);

    const history = useMemo<ChatHistoryInterface>(() => ({
        chats: chatsArray,
        isLoadingChats,
        errorLoadingChats,
        canScrollChatHistory,
        isWorking,
        fetchChats,
    }), [chatsArray, isLoadingChats, errorLoadingChats, canScrollChatHistory, isWorking, fetchChats]);

    return { handler, history };
}

const ChatHandlerContext = createContext<ChatHandlerInterface | null>(null);
const ChatHistoryContext = createContext<ChatHistoryInterface | null>(null);

export function ChatHandlerWrapper({ children, workspace, thread, llmProvider }: { children: React.ReactNode, workspace: WorkspaceType, thread: WorkspaceThreadType, llmProvider: LLMProvider }) {
    const { handler, history } = useChatHandler({ workspace, thread, llmProvider });
    return (
        <ChatHandlerContext.Provider value={handler}>
            <ChatHistoryContext.Provider value={history}>
                {children}
            </ChatHistoryContext.Provider>
        </ChatHandlerContext.Provider>
    );
}

export function useChatHandlerContext() {
    const chatHandler = useContext(ChatHandlerContext);
    if (!chatHandler) throw new Error('ChatHandlerContext not found');
    return chatHandler;
}

export function useChatHistoryContext() {
    const chatHistory = useContext(ChatHistoryContext);
    if (!chatHistory) throw new Error('ChatHistoryContext not found');
    return chatHistory;
}
