import { memo, useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Clipboard from '@react-native-clipboard/clipboard';
import { hapticOptions } from '@/utils/clipboard';
import { type WorkspaceChatResponseType } from '@/database/models/WorkspaceChat';
import { markdownRules, markdownStyles } from './rules';

/**
 * One parser for every message. The library builds a fresh MarkdownIt instance
 * per render when none is supplied, which is wasted work on every stream flush.
 */
const markdownIt = MarkdownIt({ typographer: true, linkify: true });

export default memo(function TextResponseContainer({
  uuid,
  textResponse,
  metrics,
}: {
  uuid?: string;
  textResponse?: string;
  metrics?: WorkspaceChatResponseType['metrics'];
}) {
  const [showMetrics, setShowMetrics] = useState(false);
  if (!textResponse) return null;

  const handlePress = () => {
    if (!metrics) return;
    setShowMetrics(!showMetrics);
  };

  const handleLongPress = () => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(textResponse.trim());
  };

  return (
    <View key={`${uuid}-text-response-container`} className="flex flex-row items-start w-full justify-start">
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ width: '100%' }}>
        <Markdown markdownit={markdownIt} rules={markdownRules} style={markdownStyles} mergeStyle={false}>{textResponse}</Markdown>
        {showMetrics && !!metrics && (
          <View className="flex flex-row w-full px-2 justify-end items-center gap-1">
            <Text className="text-sm text-gray-500">{metrics.total_tokens} tokens</Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{Number(metrics.duration).toFixed(0)}ms</Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{Number(metrics.outputTps).toFixed(2)} tok/s</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
});
