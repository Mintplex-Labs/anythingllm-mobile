import React, { useState } from 'react';
import { View, TouchableOpacity, Linking, Text, NativeEventEmitter, RefreshControl, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import { Gear } from 'phosphor-react-native';
import WorkspaceItem from './WorkspaceItem';
import useWorkspaces from '@/hooks/useWorkspaces';
import NewWorkspaceModal, { useNewWorkspaceModal } from '@/components/NewWorkspaceModal';
import { PATHS } from '@/utils/paths';
import SafeView from '@/components/SafeView';
import { useNavigation } from '@react-navigation/native';

export default function SidebarContent() {
  const navigation = useNavigation();
  const { loadingWorkspaces, workspaces, activeWorkspaceSlug, setActiveWorkspaceSlug, activeThreadSlug, fetchWorkspaces } = useWorkspaces(true);
  const { showNewWorkspaceModal, openNewWorkspaceModal, closeNewWorkspaceModal } = useNewWorkspaceModal();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchWorkspaces(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchWorkspaces]);

  return (
    <SafeView applyInsets={false} safeAreaClassNames='bg-[--hex-gray-10]' containerClassNames='flex-1 flex-col flex px-2 pt-4' edges={['top', 'bottom']}>
      <GestureHandlerRootView>
        <View className='flex-1 justify-between'>
          {/* Topbar */}
          <View className='flex flex-row items-center justify-between pt-[20px] w-full p-[16px] border-b border-[--hex-gray-8] shrink-0'>
            <Text className='text-2xl font-semibold text-white'>Workspaces</Text>
            <TouchableOpacity activeOpacity={0.6} onPress={() => null}>
              <Gear size={30} color='#FFF' />
            </TouchableOpacity>
          </View>

          {/* Workspaces List */}
          {loadingWorkspaces ? (
            <View className='flex-1 justify-center items-center'>
              <ActivityIndicator size='large' color='#FFF' />
            </View>
          ) : (
            <DrawerContentScrollView
              contentContainerStyle={{
                paddingTop: 21,
                flexDirection: 'column',
                gap: 32,
                paddingStart: 16,
                paddingEnd: 16,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#000']}
                  tintColor='#FFF'
                />
              }>
              {workspaces.map((ws) => (
                <WorkspaceItem
                  key={ws.slug}
                  workspace={ws}
                  isActive={ws.slug === activeWorkspaceSlug}
                  changeWorkspace={() => setActiveWorkspaceSlug(ws.slug)}
                  currentThreadSlug={activeThreadSlug}
                />
              ))}
            </DrawerContentScrollView>
          )}

          {/* Sticky Bottom Icons */}
          <View className='flex-row shrink-0 justify-around items-center py-[16px] px-[30px] border-t border-[--hex-gray-8] h-[80px]'>
            <TouchableOpacity activeOpacity={0.8} onPress={openNewWorkspaceModal} className='flex w-full flex-row items-center justify-center bg-white/10 rounded-lg py-[11px]'>
              <Text className='text-lg text-white'>New Workspace</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
      <NewWorkspaceModal showing={showNewWorkspaceModal} close={closeNewWorkspaceModal} />
    </SafeView>
  );
}