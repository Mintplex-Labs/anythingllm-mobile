import React, { Fragment, useEffect, useState } from 'react';
import { View, TouchableOpacity, Linking, Text, NativeEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import useTheme from '@/hooks/useTheme';
import { createStyles } from './styles';
import { Plus, BookOpen, GithubLogo } from 'phosphor-react-native';
import WorkspaceItem from './WorkspaceItem';
import useWorkspaces from '@/hooks/useWorkspaces';
import NewWorkspaceModal, { useNewWorkspaceModal } from '@/components/NewWorkspaceModal';

const eventEmitter = new NativeEventEmitter();
export default function SidebarContent() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { workspaces } = useWorkspaces(true);
  const { showNewWorkspaceModal, openNewWorkspaceModal, closeNewWorkspaceModal } = useNewWorkspaceModal();

  return (
    <Fragment>
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View className='flex-1 bg-[--primary-bg] pt-10 px-4'>
          <TouchableOpacity
            className='p-2 py-4 rounded-lg bg-white flex-row items-center justify-center gap-x-1'
            activeOpacity={0.8}
            onPress={openNewWorkspaceModal}
          >
            <Plus size={16} weight='bold' color={theme.colors.primary} />
            <Text className='text-base font-bold text-black'>New Workspace</Text>
          </TouchableOpacity>

          {/* Scrollable Workspaces */}
          <DrawerContentScrollView className='flex-1 max-h-[90vh]'>
            {workspaces.map((ws) => (
              <WorkspaceItem
                key={ws.slug}
                workspace={ws}
                isActive={ws.isActive}
                changeWorkspace={() => {
                  eventEmitter.emit('workspaceChatPageInfo', {
                    type: 'update',
                    details: {
                      wsSlug: ws.slug,
                    },
                  });
                }}
              />
            ))}
          </DrawerContentScrollView>

          {/* Sticky Bottom Icons */}
          <View className='flex-row justify-around items-center py-4 border-t border-white/20'>
            <TouchableOpacity onPress={() => Linking.openURL('https://docs.anythingllm.com')}>
              <BookOpen size={28} color={theme.colors.anythingllm.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Linking.openURL('https://github.com/mintplex-labs/anything-llm')}>
              <GithubLogo size={28} color={theme.colors.anythingllm.text.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
      <NewWorkspaceModal showing={showNewWorkspaceModal} close={closeNewWorkspaceModal} />
    </Fragment>
  );
}