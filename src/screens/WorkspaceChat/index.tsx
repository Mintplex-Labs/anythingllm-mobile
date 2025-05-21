import { Text, View, NativeEventEmitter } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import { useRoute } from '@react-navigation/native';
import { useEffect } from "react";

const eventEmitter = new NativeEventEmitter();
export default function WorkspaceChat() {
  const route = useRoute();
  const { wsSlug, threadSlug = null } = route.params as { wsSlug: string, threadSlug?: string | null };

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
      </View>
    </SafeView>
  );
};