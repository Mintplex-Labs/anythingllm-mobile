import { useRoute } from "@react-navigation/native";
import { useEffect } from "react";
import { NativeEventEmitter } from "react-native";
import uiStore from "@/store/UIStore";

/** Session key holding `{ wsSlug, threadSlug }` of the chat screen currently open */
export const ACTIVE_CHAT_LOCATION_KEY = '@activeChatLocation';

const eventEmitter = new NativeEventEmitter();

export default function useChatInfoEmit() {
  const route = useRoute();
  const { wsSlug, threadSlug = null } = route.params as { wsSlug: string, threadSlug?: string | null };

  // Emits the page info to the sidebar on load
  useEffect(() => {
    // Listeners that mount after this screen (the drawer) miss the event - keep the
    // latest location somewhere they can read on mount.
    uiStore.session.set(ACTIVE_CHAT_LOCATION_KEY, { wsSlug, threadSlug });
    // console.log('emitting workspaceChatPageInfo', { wsSlug, threadSlug });
    eventEmitter.emit('workspaceChatPageInfo', {
      type: 'update',
      details: {
        wsSlug,
        threadSlug,
      },
    });
  }, [wsSlug, threadSlug]);

  return {
    wsSlug,
    threadSlug,
  };
}