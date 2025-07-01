import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, RefreshControl, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import { Gear, QrCode } from 'phosphor-react-native';
import WorkspaceItem from './WorkspaceItem';
import useWorkspaces from '@/hooks/useWorkspaces';
import NewWorkspaceModal, { useNewWorkspaceModal } from '@/components/NewWorkspaceModal';
import SafeView from '@/components/SafeView';
import { useDrawerStatus } from '@react-navigation/drawer';
import { BOTTOM_SHEET_NAMES, useBottomSheet } from '@/contexts/BottomSheetContext';
import { PATHS } from '@/utils/paths';
import uiStore from '@/store/UIStore';

export default function SidebarContent({ navigation }: { navigation: any }) {
  const drawerStatus = useDrawerStatus();
  const { presentSheet, dismissAllSheets } = useBottomSheet();
  const { loadingWorkspaces, workspaces, activeWorkspaceSlug, activeThreadSlug, fetchWorkspaces } = useWorkspaces(true);
  const { showNewWorkspaceModal, openNewWorkspaceModal, closeNewWorkspaceModal } = useNewWorkspaceModal();
  const [refreshing, setRefreshing] = useState(false);

  const goToUserSettings = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
      path: PATHS.user_settings,
    });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.user_settings }],
    });
  }

  const goToWorkspaceImportStart = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
      path: PATHS.connect_to_instance,
    });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.connect_to_instance }],
    });
  }

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchWorkspaces(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (drawerStatus === 'open') return dismissAllSheets();
    if (drawerStatus === 'closed') return presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
  }, [drawerStatus]);

  useEffect(() => {
    uiStore.emitter.addListener(uiStore.globalEvents.REFRESH_WORKSPACES, onRefresh);
    return () => { uiStore.emitter.removeAllListeners(uiStore.globalEvents.REFRESH_WORKSPACES) };
  }, []);

  return (
    <SafeView applyInsets={false} safeAreaClassNames='bg-[--hex-gray-10]' containerClassNames='flex-1 flex-col flex px-2 pt-4' edges={['top', 'bottom']}>
      <GestureHandlerRootView>
        <View className='flex-1 justify-between'>
          {/* Topbar */}
          <View className='flex flex-row items-center justify-between pt-[20px] w-full p-[16px] border-b border-[--hex-gray-8] shrink-0'>
            <Text className='text-2xl font-semibold text-white'>Workspaces</Text>
            <TouchableOpacity activeOpacity={0.6} onPress={goToUserSettings}>
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
                  currentThreadSlug={activeThreadSlug}
                />
              ))}
            </DrawerContentScrollView>
          )}

          {/* Sticky Bottom Icons */}
          <View style={{ paddingVertical: 16, height: 80, paddingHorizontal: 8, gap: 16 }} className='flex flex-row justify-between items-center border-t border-[--hex-gray-8]'>
            <TouchableOpacity activeOpacity={0.8} onPress={openNewWorkspaceModal} className='flex flex-1 flex-row items-center justify-center bg-white/10 rounded-lg py-[11px]'>
              <Text className='text-lg text-white'>New Workspace</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToWorkspaceImportStart} activeOpacity={0.8} style={{ height: '100%', width: 42 }} className='flex items-center justify-center bg-white/10 rounded-lg p-[11px]'>
              <QrCode size={30} color='#FFF' />
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
      <NewWorkspaceModal showing={showNewWorkspaceModal} close={closeNewWorkspaceModal} />
    </SafeView>
  );
}