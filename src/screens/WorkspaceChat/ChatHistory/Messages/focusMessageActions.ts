import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import uiStore from '@/store/UIStore';
import { hapticOptions } from '@/utils/clipboard';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';

export type MessageRole = 'user' | 'assistant';
export type MessageActionsFocusEvent = { chat: DynamicChatMessage; role: MessageRole };

/**
 * Long-press handler shared by both bubbles. Opens the message actions sheet for the
 * pair (see MessageActionsSheet). Pairs still generating are ignored - they have no
 * saved row yet and the stop button is the way to act on them.
 */
export function focusMessageActions(chat: DynamicChatMessage, role: MessageRole) {
  if (!chat?.uuid || chat.isLoading) return;
  ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
  uiStore.emitter.emit(uiStore.globalEvents.MESSAGE_ACTIONS_FOCUSED, { chat, role } satisfies MessageActionsFocusEvent);
}
