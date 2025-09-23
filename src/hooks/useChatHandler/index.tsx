import { type WorkspaceThreadType } from "@/database/models/WorkspaceThread";
import { type WorkspaceType } from "@/database/models/Workspace";
import { type LLMProvider } from "@/utils/AiProviders";
import { useState, useMemo, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import uiStore from "@/store/UIStore";
import WorkspaceChat, { IAgentAction, IAgentToolCall, IChatCitation } from "@/database/models/WorkspaceChat";
import { merge } from 'lodash';
import { ICompleteResponse, IStreamEvent, IStreamResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { parseStreamingChunksToResponse } from "./parser";
import { activateKeepAwake, deactivateKeepAwake } from "@/utils/keepAwake";
import { Keyboard } from "react-native";
import DelegatedProvider from "@/utils/AiProviders/delegatedProvider";
import AwaitableAlert from "@/components/AwaitableAlert";
import Telemetry from "@/utils/Telemetry";

const SHOW_DEBUG_LOGS = true;

export interface ChatHandlerInterface {
    /** The current chat history for the workspace thread */
    chats: DynamicChatMessage[];
    /** Whether the chat history is loading */
    isLoadingChats: boolean;
    /** Whether the chat is currently working (could be streaming or not) */
    isWorking: boolean;
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
    /** Whether the chat workspace/thread is remote */
    isRemote: boolean;
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
    UPDATE_CHAT: 'update_chat',
    NEW_CHAT_STARTED: 'new_chat_started',
    CHAT_SCROLL_EVENT: 'chat_scroll_event',
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
    const [isWorking, setIsWorking] = useState<boolean>(false);
    const [isRemote, _] = useState<boolean>(workspace?.isRemote || thread?.isRemote);

    // Keep the latest chatsMap in a ref to avoid stale closures inside callbacks
    const chatsMapRef = useRef(chatsMap);
    useEffect(() => {
        chatsMapRef.current = chatsMap;
    }, [chatsMap]);

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
    }, [thread.slug]);

    const chatsArray = useMemo(() => {
        return Array.from(chatsMap.values());
    }, [chatsMap]);

    const concludeChat = useCallback(async (newChat: DynamicChatMessage) => {
        let chatToSave: DynamicChatMessage = { ...newChat, isLoading: false };
        setChatsMap((prevMap) => {
            const newMap = new Map(prevMap);
            newMap.set(newChat.uuid as string, chatToSave);
            return newMap;
        });

        // Emit the assistant response complete event
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE, { uuid: newChat.uuid as string });

        // Save to database after state update
        if (!chatToSave) return debug('Failed to save chat to database!');
        await WorkspaceChat.create(chatToSave)
            .then(() => debug('Chat saved to database', chatToSave.uuid))
            .catch(err => debug('Error saving chat to database', err))
            .finally(() => {
                Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.CHAT_COMPLETED, {
                    llmProvider: llmProvider.name,
                    llmModel: llmProvider.model,
                });
            });
    }, []);

    /**
     * Add a new chat to the chat history and update the UI
     */
    const _addChat = useCallback((chat: DynamicChatMessage) => {
        debug('Creating new chat', chat.uuid);
        setChatsMap((prevMap) => {
            const newMap = new Map(prevMap);
            newMap.set(chat.uuid as string, chat);
            return newMap;
        });
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.NEW_CHAT_STARTED, { uuid: chat.uuid as string, chat: chat });
    }, []);

    /**
     * Process a chat and add it to the chat history
     * as well as kick off the LLM inference
     */
    const _processChat = useCallback(async (prompt: string) => {
        let newChat = WorkspaceChat.newChatItem({ workspaceThreadSlug: thread.slug, prompt });
        try {
            activateKeepAwake();
            _addChat(newChat as DynamicChatMessage);
            const messageHistory = Array.from(chatsMapRef.current.values()).concat([newChat as DynamicChatMessage]);
            let accumulator = '';

            // Internal function to handle stream events in a cleaner way
            // without doing everything in the callback directly. Just my personal preference.
            function handleStreamEvent(event: IStreamEvent, data: IStreamResponse) {
                let emitUpdate = false;
                switch (event) {
                    case 'abort':
                        throw new Error('Chat aborted');
                    case 'timed_out':
                        debug('Chat stream timed out');
                        merge(newChat, { isLoading: false, type: 'error', response: { textResponse: 'The request timed out before a response was received. Connection may be lost.' } });
                        emitUpdate = true;
                        break;
                    case 'complete':
                        debug('Chat stream complete');
                        merge(newChat, { isLoading: false });
                        emitUpdate = true;
                        break;
                    case 'report_metrics':
                        debug('Report metrics', data);
                        merge(newChat, { response: { metrics: data as ICompleteResponse['metrics'] } });
                        break;
                    case 'report_citations':
                        debug('Report citations', data);
                        const citations = newChat.response?.citations || [];
                        for (const citation of data as IChatCitation[]) citations.push(citation);
                        merge(newChat, { response: { citations } });
                        emitUpdate = true;
                        break;
                    case 'report_action':
                        debug('Report action', data);
                        const actions = newChat.response?.actions || [];
                        actions.push(data as IAgentAction);
                        merge(newChat, { response: { actions } });
                        emitUpdate = true;
                        break;
                    case 'will_call_tools':
                        // moves existing thoughts to the current thought chain so thoughts are cleared
                        // nullifies the text response as it is not valid anymore
                        debug('Will call tool', data);
                        merge(newChat, {
                            response: {
                                currentThoughtChain: [...(newChat.response?.thoughts || [])],
                                thoughts: [],
                                toolCalls: [],
                                textResponse: '',
                            }
                        });
                        accumulator = '';
                        emitUpdate = true;
                        break;
                    case 'report_tool_call':
                        merge(newChat, { response: { toolCalls: [...(newChat.response?.toolCalls || []), data] } });
                        emitUpdate = true;
                        break;
                    case 'report_tool_call_result':
                        const toolCallResult = data as IAgentToolCall;
                        if (!newChat.response?.toolCalls) return;

                        const existingToolCall = newChat.response?.toolCalls.find(t => t.uuid === toolCallResult.uuid);
                        if (!existingToolCall) return;

                        debug('Updating tool call result', toolCallResult.uuid);
                        existingToolCall.result = toolCallResult.result;
                        merge(newChat, { response: { toolCalls: newChat.response?.toolCalls } });
                        emitUpdate = true;
                        break;
                    case 'report_in_progress_thought':
                        const inProgressThought = data as string;
                        merge(newChat, {
                            response: {
                                thoughts: [...(newChat.response?.thoughts || []), inProgressThought],
                                currentThoughtChain: [...(newChat.response?.currentThoughtChain || []), inProgressThought]
                            }
                        });
                        emitUpdate = true;
                        break;
                    case 'chunk':
                        const parsed = parseStreamingChunksToResponse(event, accumulator, data as string);
                        accumulator += data;
                        if (!parsed) return debug('No parsable content - skipping');
                        merge(newChat, { response: { textResponse: parsed.textResponse, thoughts: [...(newChat.response?.currentThoughtChain || []), parsed.reasoningContent] } });
                        emitUpdate = true;
                        break;
                    default:
                        debug('Unhandled stream event', event, data);
                }
                if (emitUpdate) {
                    uiStore.emitter.emit(CHAT_HANDLER_EVENTS.UPDATE_CHAT, { uuid: newChat.uuid as string, chat: newChat });
                    uiStore.emitter.emit(CHAT_HANDLER_EVENTS.CHAT_SCROLL_EVENT);
                }
                return;
            };

            // Establish the caller as the local provider
            // If the workspace is remote and reachable, we will update
            // the caller to the delegated provider. If the remote provider
            // is non reachable, we will ask the user to confirm.
            let caller = () => llmProvider.chat({
                messages: messageHistory,
                streaming: true,
                onComplete: (response) => merge(newChat, { type: 'error', response: { textResponse: response.textResponse, metrics: response.metrics } }),
                onStream: (event, data) => handleStreamEvent(event, data),
            }) as Promise<any>;

            if (isRemote) {
                const config = {
                    connectionUrl: workspace.remoteConfig.connectionUrl,
                    deviceToken: workspace.remoteConfig.deviceToken,
                    workspaceSlug: workspace.remoteConfig.slug,
                    threadSlug: thread.remoteConfig.slug,
                    onStream: (event, data) => handleStreamEvent(event, data),
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
                merge(newChat, { type: 'error', response: { textResponse: err.message || 'Error processing chat' } });
            }).finally(async () => {
                await concludeChat(newChat as DynamicChatMessage);
            });
        } catch (err) {
            debug('Error processing chat', err);
            merge(newChat, { isLoading: false, type: 'error', response: { textResponse: (err as Error).message || 'Error processing chat' } });
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.UPDATE_CHAT, { uuid: newChat.uuid as string, chat: newChat });
        } finally {
            deactivateKeepAwake();
        }
    }, [thread.slug, _addChat, llmProvider, concludeChat]);

    const canScrollChatHistory = useMemo(() => {
        return !isLoadingChats && chatsArray.length > 0;
    }, [isLoadingChats, chatsArray]);

    const setPrompt = useCallback((promptToSet: string, autoSubmit: boolean = false) => {
        _setPrompt(promptToSet);
        if (autoSubmit) submitPrompt(promptToSet);
    }, [prompt, _processChat]);

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
    }, [prompt]);

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

    const chatHandlerInterface = useMemo(() => {
        return {
            // Chat History
            chats: chatsArray,
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
            isWorking,
            isRemote,
        }
    }, [
        chatsMap,
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
        isWorking,
        isRemote,
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