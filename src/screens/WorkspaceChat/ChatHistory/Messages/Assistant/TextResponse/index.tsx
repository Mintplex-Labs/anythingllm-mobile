import { memo, useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { type WorkspaceChatResponseType } from '@/database/models/WorkspaceChat';
import { markdownRules, markdownStyles } from './rules';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatGroupedNumber, formatNumber } from '@/utils/formatters';

/**
 * One parser for every message. The library builds a fresh MarkdownIt instance
 * per render when none is supplied, which is wasted work on every stream flush.
 */
const markdownIt = MarkdownIt({ typographer: true, linkify: true });

export default memo(function TextResponseContainer({
  uuid,
  textResponse,
  metrics,
  onLongPress,
}: {
  uuid?: string;
  textResponse?: string;
  metrics?: WorkspaceChatResponseType['metrics'];
  /** Opens the message actions sheet for this pair (copy, delete, fork) */
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const [showMetrics, setShowMetrics] = useState(false);
  if (!textResponse) return null;
  const totalTokens = Number(metrics?.total_tokens) || 0;

  const handlePress = () => {
    if (!metrics) return;
    setShowMetrics(!showMetrics);
  };

  return (
    <View key={`${uuid}-text-response-container`} className="flex flex-row items-start w-full justify-start">
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={onLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        style={{ width: '100%' }}>
        <Markdown markdownit={markdownIt} rules={markdownRules} style={markdownStyles} mergeStyle={false}>{textResponse}</Markdown>
        {showMetrics && !!metrics && (
          <View className="flex flex-row w-full px-2 justify-end items-center gap-1">
            <Text className="text-sm text-gray-500">
              {t('chat.metrics.tokens', { count: totalTokens, value: formatNumber(totalTokens, 1) })}
            </Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{formatDuration(Number(metrics.duration))}</Text>
            <Text className="text-sm text-gray-500">•</Text>
            <Text className="text-sm text-gray-500">{formatGroupedNumber(Number(metrics.outputTps))} tok/s</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
});
