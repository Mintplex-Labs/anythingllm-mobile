import { Text, View, TouchableOpacity } from 'react-native';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import ImageAttachmentGrid, { isImageAttachment } from '@/components/ImageAttachmentGrid';
import { focusMessageActions } from '../focusMessageActions';

export default function UserMessage({ chat }: { chat: DynamicChatMessage }) {
  if (!chat.prompt) return null;
  const images = (chat.response?.attachments ?? []).filter(isImageAttachment);
  return (
    <View className="flex flex-row items-start w-full justify-end">
      <TouchableOpacity
        onLongPress={() => focusMessageActions(chat, 'user')}
        delayLongPress={500}
        activeOpacity={0.7}
        // Children align to the end and size themselves - the text bubble must not stretch to the
        // width of the image collage above it (a short prompt keeps a short bubble).
        style={{ maxWidth: '95%', alignItems: 'flex-end' }}>
        {images.length > 0 && <ImageAttachmentGrid images={images} style={{ marginBottom: 6 }} />}
        <View
          className="bg-white/10 rounded-lg"
          style={{ paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' }}>
          <Text className="text-white text-right">{chat.prompt}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
