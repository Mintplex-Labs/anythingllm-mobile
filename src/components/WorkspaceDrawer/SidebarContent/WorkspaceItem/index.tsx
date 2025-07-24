import { View, Text, Alert, TextInput, Modal, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { SquaresFour, CaretUp, Laptop, Cloud } from "phosphor-react-native";
import { Fragment, useEffect, useState } from "react";
import ThreadItem from "./ThreadItem";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useNavigation } from "@react-navigation/native";

interface IWorkspaceItem {
  workspace: any;
  isActive?: boolean;
  currentThreadSlug: string | null;
}

const eventEmitter = new NativeEventEmitter();
function WorkspaceItem({ workspace, isActive = false, currentThreadSlug }: IWorkspaceItem) {
  const navigation = useNavigation();
  const _activeThreadIdx = workspace.threads?.findIndex((t: any) => t.slug === currentThreadSlug);
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [threadSlug, setThreadSlug] = useState('');
  const [activeThreadIdx, setActiveThreadIdx] = useState(_activeThreadIdx !== -1 ? _activeThreadIdx : 0);
  const [newThreadName, setNewThreadName] = useState(workspace.threads?.[_activeThreadIdx]?.name || '');
  const [isExpanded, setIsExpanded] = useState(isActive);

  async function handleThreadDelete(threadSlug: string) {
    Alert.alert('Delete thread', 'Are you sure you want to delete this thread? All chat history will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', onPress: async () => {
          await WorkspaceThread.delete([{ field: 'workspace_slug', value: workspace.slug }, { field: 'slug', value: threadSlug }]).then(() => {
            eventEmitter.emit('workspaceUpdate', {
              type: 'remove-thread',
              details: {
                workspaceSlug: workspace.slug,
                threadSlug: threadSlug,
              },
            });
          });

          const threads = await WorkspaceThread.find([{ field: 'workspace_slug', value: workspace.slug }]);
          if (threads.length === 0) {
            const newThread = await WorkspaceThread.create({ workspaceSlug: workspace.slug });
            eventEmitter.emit('workspaceUpdate', {
              type: 'add-thread',
              details: {
                workspaceSlug: newThread.workspaceSlug,
                thread: newThread,
              },
            });
            navigation.reset({
              index: 0,
              // @ts-ignore
              routes: [{ name: PATHS.workspace_chat, params: { workspaceSlug: workspace.slug, threadSlug: newThread.slug } }],
            });
          } else {
            const thread = threads[0];
            navigation.reset({
              index: 0,
              // @ts-ignore
              routes: [{ name: PATHS.workspace_chat, params: { workspaceSlug: workspace.slug, threadSlug: thread.slug } }],
            });
          }
        }
      },
    ]);
  }

  async function handleWorkspaceDelete() {
    Alert.alert('Delete workspace', `Are you sure you want to delete this workspace? All threads will be lost.${workspace.isRemote ? '\n\nThis will not delete the workspace in your remote instance.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Workspace.delete([{ field: 'slug', value: workspace.slug }]).then(() => {
            eventEmitter.emit('workspaceUpdate', {
              type: 'remove-workspace',
              details: { workspaceSlug: workspace.slug },
            });
          });

          const workspaces = await Workspace.find([], true);
          console.log('WorkspaceItem:handleWorkspaceDelete:workspaces', workspaces.length);
          if (workspaces.length === 0) {
            navigation.reset({
              index: 0,
              // @ts-ignore
              routes: [{ name: PATHS.home }],
            });
          } else {
            const workspace = workspaces[0];
            navigation.reset({
              index: 0,
              // @ts-ignore
              routes: [{ name: PATHS.workspace_chat, params: { workspaceSlug: workspace.slug, threadSlug: workspace.threads[0].slug } }],
            });
          }
        }
      },
    ]);
  }

  async function handleThreadRename(threadSlug: string, newName: string) {
    setThreadSlug(threadSlug);
    setIsRenameModalVisible(false);
    setNewThreadName('');
    if (!newName) return;
    WorkspaceThread.update([{ field: 'workspace_slug', value: workspace.slug }, { field: 'slug', value: threadSlug }], { name: newName }).then(() => {
      eventEmitter.emit('workspaceUpdate', {
        type: 'rename-thread',
        details: { workspaceSlug: workspace.slug, threadSlug: threadSlug, newName: newName },
      });
    });
  }

  return (
    <Fragment>
      <View className="flex flex-col gap-y-2">
        <WorkspaceHeader
          workspace={workspace}
          isActive={isActive}
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          handleWorkspaceDelete={handleWorkspaceDelete}
        />
        {isExpanded && (
          <WorkspaceThreadsContainer
            workspace={{ ...workspace, isActive }}
            activeThreadIdx={activeThreadIdx}
            setActiveThreadIdx={setActiveThreadIdx}
            handleThreadDelete={handleThreadDelete}
            setThreadSlug={setThreadSlug}
            setIsRenameModalVisible={setIsRenameModalVisible}
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isRenameModalVisible}
        onRequestClose={() => setIsRenameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 justify-center items-center bg-black/50">
            <View className="bg-[--primary-bg] rounded-lg p-6 w-4/5 max-h-[80%]">
              <Text className="text-xl font-bold mb-4 text-[--primary-text]">Rename Thread</Text>
              <TextInput
                className="border border-white/20 rounded-lg p-2 mb-4 text-[--secondary-bg] !text-white placeholder:text-white/50"
                value={newThreadName}
                onChangeText={setNewThreadName}
                placeholder="Enter new thread name"
              />
              <View className="flex-row justify-between gap-x-2">
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg bg-transparent"
                  onPress={() => setIsRenameModalVisible(false)}
                >
                  <Text className="text-white/50">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg bg-transparent border border-white"
                  onPress={() => handleThreadRename(threadSlug, newThreadName)}
                >
                  <Text className="text-white">Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Fragment>
  );
}

interface IWorkspaceHeader {
  workspace: any;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  handleWorkspaceDelete: () => void;
}

function WorkspaceHeader({ workspace, isActive, isExpanded, onClick, handleWorkspaceDelete }: IWorkspaceHeader) {
  const WorkspaceIcon = workspace.isRemote ? (workspace.remoteConfig.platform === 'desktop' ? Laptop : Cloud) : SquaresFour;
  return (
    <TouchableOpacity
      key={workspace.slug}
      onLongPress={handleWorkspaceDelete}
      onPress={onClick}
      activeOpacity={0.8}
      className={`flex flex-row items-center justify-between w-full pl-[16px] pr-2 rounded-lg py-[8px] ${isActive ? 'bg-white/5' : 'bg-transparent'}`}
    >
      <View className="flex flex-row items-center gap-x-[6px]">
        <View className='w-[24px] h-[24px] flex items-center justify-center'>
          <WorkspaceIcon size={24} color='#FFF' />
        </View>
        <Text className='text-lg text-white' numberOfLines={1} ellipsizeMode="tail" style={{ width: 200 }}>
          {workspace.name}
        </Text>
      </View>
      <View style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }} className={`flex items-center justify-center`}>
        <CaretUp size={14} color='#FFF' weight="bold" />
      </View>
    </TouchableOpacity >
  );
}

interface IWorkspaceThreadsContainer {
  workspace: any;
  activeThreadIdx: number;
  setActiveThreadIdx: (idx: number) => void;
  handleThreadDelete: (slug: string) => void;
  setThreadSlug: (slug: string) => void;
  setIsRenameModalVisible: (visible: boolean) => void;
}
function WorkspaceThreadsContainer({ workspace, activeThreadIdx, setActiveThreadIdx, handleThreadDelete, setThreadSlug, setIsRenameModalVisible }: IWorkspaceThreadsContainer) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!workspace.threads) return;
    uiStore.emitter.addListener(uiStore.globalEvents.REDIRECT, (event) => {
      if (event.path !== PATHS.workspace_chat) return;
      if (event.params.wsSlug !== workspace.slug) return;
      setActiveThreadIdx(workspace.threads?.findIndex((t: any) => t.slug === event.params.threadSlug) || 0);
    });
    return () => uiStore.emitter.removeAllListeners(uiStore.globalEvents.REDIRECT);
  }, [workspace.threads]);
  if (!workspace.threads) return null;

  return (
    <View style={{ gap: 8 }} className='flex flex-col items-start justify-left ml-8'>
      {workspace.threads?.map((thread: any, idx: number) => {
        return (
          <ThreadItem
            key={thread.slug}
            isActive={workspace.isActive && idx === activeThreadIdx}
            thread={thread}
            onPress={() => {
              setActiveThreadIdx(idx)
              navigation.reset({
                index: 0,
                // @ts-ignore
                routes: [{ name: PATHS.workspace_chat, params: { wsSlug: workspace.slug, threadSlug: thread.slug } }],
              });
            }}
            onDelete={handleThreadDelete.bind(null, thread.slug)}
            onRename={() => {
              setThreadSlug(thread.slug);
              setIsRenameModalVisible(true);
            }}
          />
        )
      })}
    </View>
  )
}

export default WorkspaceItem;