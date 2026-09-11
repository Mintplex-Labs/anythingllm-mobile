import { Text, View, TouchableOpacity } from 'react-native';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import { focusMessageActions } from '../focusMessageActions';

export default function UserMessage({ chat }: { chat: DynamicChatMessage }) {
  if (!chat.prompt) return null;
  return (
    <View className="flex flex-row items-start w-full justify-end">
      <TouchableOpacity
        onLongPress={() => focusMessageActions(chat, 'user')}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ maxWidth: '95%' }}>
        <View
          className="bg-white/10 rounded-lg"
          style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text className="text-white text-right">{chat.prompt}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
