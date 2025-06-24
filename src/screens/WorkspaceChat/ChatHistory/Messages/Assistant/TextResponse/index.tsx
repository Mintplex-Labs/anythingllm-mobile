import { View, TouchableOpacity } from 'react-native';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { markdownRules } from './rules';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Clipboard from '@react-native-clipboard/clipboard';
import { hapticOptions } from '@/utils/clipboard';
MarkdownIt({ typographer: true, linkify: true });

export default function TextResponseContainer({
  chat,
}: {
  chat: DynamicChatMessage;
}) {
  const textResponse = chat.response?.textResponse;
  if (!textResponse) return null;

  const handleLongPress = () => {
    if (!textResponse) return;
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(textResponse.trim());
  };

  return (
    <View className="flex flex-row items-start w-full justify-start">
      <TouchableOpacity
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ width: '100%' }}>
        <Markdown rules={markdownRules}>{textResponse}</Markdown>
      </TouchableOpacity>
    </View>
  );
}
