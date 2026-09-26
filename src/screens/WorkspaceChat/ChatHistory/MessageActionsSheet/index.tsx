import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, NativeEventEmitter } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ArrowClockwise, Copy, GitBranch, Trash } from 'phosphor-react-native';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { MenuRow, DANGER, MUTED_TEXT, SHEET_BACKGROUND } from '@/components/SheetMenu';
import { useChatHandlerContext } from '@/hooks/useChatHandler';
import WorkspaceThread, { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import WorkspaceChat from '@/database/models/WorkspaceChat';
import { type WorkspaceType } from '@/database/models/Workspace';
import uiStore from '@/store/UIStore';
import { hapticOptions } from '@/utils/clipboard';
import { showToast } from '@/utils/Notification';
import { PATHS } from '@/utils/paths';
import Telemetry from '@/utils/Telemetry';
import { type MessageActionsFocusEvent } from '../Messages/focusMessageActions';
import { useTranslation } from 'react-i18next';

/** Max length of the forked thread's name ("Copy of <name>") - the thread name validator caps names at 100 chars */
const MAX_THREAD_NAME_LENGTH = 100;

/**
 * Bottom sheet opened by long-pressing a message bubble. Lives at the chat screen level
 * (inside the ChatHandlerWrapper so it can reach delete/retry) rather than inside the
 * virtualized row that triggered it - see the note in WorkspaceChat/index.tsx.
 *
 * User bubble: Copy Message, Retry.
 * Assistant bubble: Copy Message, Fork Thread, Delete Reply.
 */
export default function MessageActionsSheet({ workspace, thread }: { workspace: WorkspaceType; thread: WorkspaceThreadType }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
  const { isWorking, isRemote, deleteChat, retryChat } = useChatHandlerContext();
  const [focused, setFocused] = useState<MessageActionsFocusEvent | null>(null);
  const [forking, setForking] = useState(false);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />,
    [],
  );

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.MESSAGE_ACTIONS, sheetRef);
  }, [registerSheet]);

  useEffect(() => {
    uiStore.emitter.addListener(uiStore.globalEvents.MESSAGE_ACTIONS_FOCUSED, (event: MessageActionsFocusEvent) => {
      if (!event?.chat?.uuid) return;
      setFocused(event);
      presentSheet(BOTTOM_SHEET_NAMES.MESSAGE_ACTIONS, true);
    });
    return () => uiStore.emitter.removeAllListeners(uiStore.globalEvents.MESSAGE_ACTIONS_FOCUSED);
  }, [presentSheet]);

  const dismiss = () => dismissSheet(BOTTOM_SHEET_NAMES.MESSAGE_ACTIONS);

  const handleDismiss = () => {
    setFocused(null);
    setForking(false);
    dismiss();
  };

  const handleCopy = () => {
    if (!focused) return;
    const text = focused.role === 'user' ? focused.chat.prompt : focused.chat.response?.textResponse;
    if (text?.trim()) {
      Clipboard.setString(text.trim());
      ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
      showToast(t('chat.message_actions.copied'));
    }
    dismiss();
  };

  const handleRetry = () => {
    if (!focused?.chat.uuid || isWorking) return;
    const { uuid } = focused.chat;
    dismiss();
    // Fire after dismiss so the sheet animation is not blocked by the model spinning up.
    retryChat(uuid).catch(error => {
      console.error('[MessageActions] retry failed', error);
      showToast(t('chat.message_actions.retry_failed'), 'long');
    });
  };

  const handleDelete = () => {
    if (!focused?.chat.uuid) return;
    const { uuid } = focused.chat;
    dismiss();
    deleteChat(uuid)
      .then(() => Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.CHAT_DELETED, { isRemote }))
      .catch(error => {
        console.error('[MessageActions] delete failed', error);
        showToast(t('chat.message_actions.delete_failed'), 'long');
      });
  };

  const handleFork = async () => {
    if (forking || isRemote) return;
    setForking(true);
    try {
      const newThread = await WorkspaceThread.create({ workspaceSlug: workspace.slug });
      const name = t('chat.message_actions.fork_name', { name: thread.name }).slice(0, MAX_THREAD_NAME_LENGTH);
      const renamed = await WorkspaceThread.update(
        [{ field: 'workspace_slug', value: workspace.slug }, { field: 'slug', value: newThread.slug }],
        { name },
      );
      const forkedThread = renamed ?? newThread;
      const messageCount = await WorkspaceChat.fork({ fromThreadSlug: thread.slug, toThreadSlug: newThread.slug });
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.THREAD_FORKED, { messageCount });

      // Same event + navigation choreography as the "new thread" button in the TopBar.
      new NativeEventEmitter().emit('workspaceUpdate', {
        type: 'add-thread',
        details: { workspaceSlug: workspace.slug, thread: forkedThread },
      });
      const params = { wsSlug: workspace.slug, threadSlug: forkedThread.slug };
      uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, { path: PATHS.workspace_chat, params });
      dismiss();
      navigation.reset({
        index: 0,
        // @ts-ignore
        routes: [{ name: PATHS.workspace_chat, params }],
      });
    } catch (error: any) {
      console.error('[MessageActions] fork failed', error);
      showToast(t('chat.message_actions.fork_failed', { error: error?.message ?? t('chat.unknown_error') }), 'long');
    } finally {
      setForking(false);
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: SHEET_BACKGROUND }}
      handleIndicatorStyle={{ backgroundColor: MUTED_TEXT, width: 45, margin: 10 }}
      onDismiss={handleDismiss}>
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        <MenuRow icon={<Copy size={22} color="#FFF" />} title={t('chat.message_actions.copy_title')} description={t('chat.message_actions.copy_description')} onPress={handleCopy} trailing={null} />

        {focused?.role === 'user' && (
          <MenuRow
            icon={<ArrowClockwise size={22} color="#FFF" />}
            title={t('common.retry')}
            description={isWorking ? t('chat.message_actions.retry_wait') : t('chat.message_actions.retry_description')}
            disabled={isWorking}
            onPress={handleRetry}
            trailing={null}
          />
        )}

        {focused?.role === 'assistant' && (
          <>
            <MenuRow
              icon={<GitBranch size={22} color="#FFF" />}
              title={t('chat.message_actions.fork_title')}
              description={isRemote ? t('chat.message_actions.fork_remote_unavailable') : t('chat.message_actions.fork_description')}
              disabled={isRemote || forking}
              onPress={handleFork}
              trailing={forking ? <ActivityIndicator color="#FFF" /> : null}
            />
            <MenuRow
              icon={<Trash size={22} color={DANGER} />}
              title={t('chat.message_actions.delete_title')}
              titleColor={DANGER}
              description={t('chat.message_actions.delete_description')}
              onPress={handleDelete}
              trailing={null}
            />
          </>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
