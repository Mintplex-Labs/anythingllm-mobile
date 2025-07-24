import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  NativeEventEmitter,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { List } from 'phosphor-react-native';
import useDevShortcut from './useDevShortcut';
import NewThreadIcon from '@/assets/new-thread.svg';
import WorkspaceThread from '@/database/models/WorkspaceThread';
import { PATHS } from '@/utils/paths';
import ModelChip from './ModelChip';
import uiStore from '@/store/UIStore';

export default function TopBar({
  workspace,
  thread,
}: {
  workspace?: any;
  thread?: any;
}) {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const { registerPress, showDebug } = useDevShortcut({ workspace, thread });
  const canMakeThread = !!workspace && !!thread;

  function handleNewThread() {
    const eventEmitter = new NativeEventEmitter();
    WorkspaceThread.create({ workspaceSlug: workspace.slug }).then(thread => {
      eventEmitter.emit('workspaceUpdate', {
        type: 'add-thread',
        details: {
          workspaceSlug: workspace.slug,
          thread,
        },
      });
      uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
        path: PATHS.workspace_chat,
        params: { wsSlug: workspace.slug, threadSlug: thread.slug },
      });
      navigation.reset({
        index: 0,
        // @ts-ignore
        routes: [
          {
            name: PATHS.workspace_chat,
            params: { wsSlug: workspace.slug, threadSlug: thread.slug },
          },
        ],
      });
    });
  }

  return (
    <View className="flex flex-row items-center justify-between h-fit min-h-[50px] pb-2">
      <TouchableOpacity onPress={() => navigation.openDrawer()}>
        <List size={34} color="white" />
      </TouchableOpacity>
      <View className="flex flex-col items-center gap-y-0">
        <TouchableOpacity
          onLongPress={showDebug}
          onPress={registerPress}
          className="flex flex-col items-center gap-y-0">
          <Image
            source={require('@/assets/logo/anything-llm.png')}
            style={{
              width: 150,
              height: 50,
            }}
            resizeMode="center"
          />
        </TouchableOpacity>
        <ModelChip workspace={workspace} />
      </View>
      {canMakeThread ? (
        <TouchableOpacity onPress={handleNewThread}>
          <NewThreadIcon width={32} height={32} fill="white" />
        </TouchableOpacity>
      ) : (
        <View className="w-[32px]" />
      )}
    </View>
  );
}
