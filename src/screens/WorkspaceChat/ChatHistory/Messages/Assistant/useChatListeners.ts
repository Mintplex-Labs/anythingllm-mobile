import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { useState, useEffect } from "react";
import uiStore from "@/store/UIStore";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";

/**
 * This hook is used to listen to the chat updates and teardown the listeners when the chat is complete
 * This is done since to simplify the component tree, we are not using the chat handler context to spam
 * the chat handler context with updates which will lead to maximum call stack issues
 */
export default function useChatListeners(chat: DynamicChatMessage) {
    const [localChat, setLocalChat] = useState<DynamicChatMessage>({ ...chat });
    const [autoClose, setAutoClose] = useState(false);

    function setupListeners() {
        // Update the local chat state when the chat is updated
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.UPDATE_CHAT, (event) => {
            if (event.uuid !== chat.uuid) return
            setLocalChat({ ...event.chat } as DynamicChatMessage);
        });

        // Teardown the listeners when the chat is complete
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE, (event) => {
            if (event.uuid !== chat.uuid) return
            teardownListeners();
        });

        /**
         * Set auto close to true when a new chat is started
         * This listener is not torn down since it is used to close the supplemental UI containers
         * so it needs to persist even after the chat is complete. It will self remove once invoked.
         */
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.NEW_CHAT_STARTED, (event) => {
            if (event.uuid === chat.uuid) return; // Do not close the current chat
            setAutoClose(true);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.NEW_CHAT_STARTED);
        });
    }

    function teardownListeners() {
        uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.UPDATE_CHAT);
        uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.ASSISTANT_RESPONSE_COMPLETE);
    }

    useEffect(() => {
        setupListeners();
        return () => teardownListeners();
    }, []);

    return { chat: localChat, autoClose };
}