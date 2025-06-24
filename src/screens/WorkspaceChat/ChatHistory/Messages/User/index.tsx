import { type WorkspaceChatType } from '@/database/models/WorkspaceChat';
import { Text, View, TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Clipboard from '@react-native-clipboard/clipboard';
import { hapticOptions } from '@/utils/clipboard';

export default function UserMessage({ prompt }: Partial<WorkspaceChatType>) {
  const handleLongPress = () => {
    if (!prompt) return;
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(prompt.trim());
  };

  return (
    <View className="flex flex-row items-start w-full justify-end">
      <TouchableOpacity
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ maxWidth: '95%' }}>
        <View
          className="bg-white/10 rounded-lg"
          style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text className="text-white text-right">{prompt}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
