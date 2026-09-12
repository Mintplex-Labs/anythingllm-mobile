import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

const markdownIt = MarkdownIt({ typographer: true });

const mdStyles = StyleSheet.create({
  body: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  heading1: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  heading2: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  bullet_list_icon: { color: '#9F9FA0', fontSize: 14, marginTop: 2 },
  list_item: { marginVertical: 3 },
  strong: { color: '#FFFFFF', fontWeight: '600' },
  code_inline: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(178,221,255,0.2)',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'monospace',
  },
  link: { color: '#7cd4fd', textDecorationLine: 'underline' },
});

export default function ChangelogModal({
  visible,
  content,
  onClose,
}: {
  visible: boolean;
  content: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <ScrollView
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: 8 }}>
            <Pressable onPress={e => e.stopPropagation()}>
              <Markdown markdownit={markdownIt} style={mdStyles}>
                {content}
              </Markdown>
            </Pressable>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1B1B1E',
    borderRadius: 12,
    padding: 20,
    maxHeight: '70%',
    width: '100%',
  },
});
