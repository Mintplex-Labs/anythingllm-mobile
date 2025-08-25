import { View, TouchableOpacity, Text } from 'react-native';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { markdownRules, markdownStyles } from './rules';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Clipboard from '@react-native-clipboard/clipboard';
import { hapticOptions } from '@/utils/clipboard';
import { useState } from 'react';
import { generateUUID } from '@/utils/constants';
MarkdownIt({ typographer: true, linkify: true });

export default function TextResponseContainer({ chat }: { chat: DynamicChatMessage }) {
  const [showMetrics, setShowMetrics] = useState(false);
  const textResponse = chat.response?.textResponse;
  if (!textResponse) return null;

  const handlePress = () => {
    if (!chat?.response?.metrics) return;
    setShowMetrics(!showMetrics);
  };

  const handleLongPress = () => {
    if (!textResponse) return;
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(textResponse.trim());
  };

  return (
    <View key={`${chat?.uuid ?? generateUUID()}-text-response-container`} className="flex flex-row items-start w-full justify-start">
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ width: '100%' }}>
        <Markdown rules={markdownRules} style={markdownStyles} mergeStyle={false}>{textResponse}</Markdown>
        {showMetrics && (
          <View className="flex flex-row w-full px-2 justify-end items-center gap-1">
            <Text className="text-sm text-gray-500">{chat?.response?.metrics?.total_tokens} tokens</Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{Number(chat?.response?.metrics?.duration).toFixed(0)}ms</Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{Number(chat?.response?.metrics?.outputTps).toFixed(2)} tok/s</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
