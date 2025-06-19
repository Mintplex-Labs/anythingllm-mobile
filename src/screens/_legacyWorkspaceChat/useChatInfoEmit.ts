import { useRoute } from "@react-navigation/native";
import { useEffect } from "react";
import { NativeEventEmitter } from "react-native";

const eventEmitter = new NativeEventEmitter();

export default function useChatInfoEmit() {
  const route = useRoute();
  const { wsSlug, threadSlug = null } = route.params as { wsSlug: string, threadSlug?: string | null };

  // Emits the page info to the sidebar on load
  useEffect(() => {
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