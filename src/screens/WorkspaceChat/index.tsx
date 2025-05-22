import { Text, View, NativeEventEmitter } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import { useRoute } from '@react-navigation/native';
import { useEffect } from "react";
import useRedirect from "@/hooks/useRedirect";

const eventEmitter = new NativeEventEmitter();
export default function WorkspaceChat() {
  useRedirect();
  const route = useRoute();
  const { wsSlug, threadSlug = null } = route.params as { wsSlug: string, threadSlug?: string | null };

  // Emits the page info to the sidebar on load
  useEffect(() => {
    eventEmitter.emit('workspaceChatPageInfo', {
      type: 'update',
      details: {
        wsSlug,
        threadSlug,
      },
    });
  }, []);

  return (
    <SafeView scrollable={false} >
      <TopBar />
      <View className="flex flex-col h-[90vh] justify-center items-center gap-y-4">
        <Text className="text-2xl font-bold text-white">Start Chatting</Text>
        <Text className="text-white text-center">
          {wsSlug}
        </Text>
        <Text className="text-white text-center">
          {threadSlug}
        </Text>
      </View>
    </SafeView>
  );
};