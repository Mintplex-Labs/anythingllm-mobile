import { View, Text, Alert, TextInput, Modal, TouchableOpacity } from "react-native";
import { DotsSixVertical, UploadSimple, Gear, Plus } from "phosphor-react-native";
import { Fragment, useState } from "react";
import ThreadItem from "./ThreadItem";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";
import { PATHS } from "@/utils/paths";

const eventEmitter = new NativeEventEmitter();

function WorkspaceItem({ workspace, isActive = false, changeWorkspace, currentThreadSlug }: { workspace: any, isActive?: boolean, changeWorkspace: () => void, currentThreadSlug: string | null }) {
  const _activeThreadIdx = workspace.threads.findIndex((t: any) => t.slug === currentThreadSlug);
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [threadSlug, setThreadSlug] = useState('');
  const [activeThreadIdx, setActiveThreadIdx] = useState(_activeThreadIdx !== -1 ? _activeThreadIdx : 0);
  const [newThreadName, setNewThreadName] = useState(workspace.threads?.[_activeThreadIdx]?.name || '');
  const color = isActive ? 'white' : '#E2E8F0';
  const bgColor = isActive ? 'bg-white/40' : 'bg-white/20';

  async function handleThreadDelete(threadSlug: string) {
    Alert.alert('Delete thread', 'Are you sure you want to delete this thread? All chat history will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', onPress: () => {
          WorkspaceThread.delete(workspace.slug, threadSlug).then(() => {
            eventEmitter.emit('workspaceUpdate', {
              type: 'remove-thread',
              details: {
                workspaceSlug: workspace.slug,
                threadSlug: threadSlug,
              },
            });
          });
        }
      },
    ]);
  }

  async function handleWorkspaceDelete() {
    Alert.alert('Delete workspace', 'Are you sure you want to delete this workspace? All threads will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Workspace.delete(workspace.slug).then(() => {
            eventEmitter.emit('workspaceUpdate', {
              type: 'remove-workspace',
              details: { workspaceSlug: workspace.slug },
            });
          });
        }
      },
    ]);
  }

  async function handleThreadRename(threadSlug: string, newName: string) {
    setThreadSlug(threadSlug);
    setIsRenameModalVisible(false);
    setNewThreadName('');
    if (!newName) return;
    WorkspaceThread.update(workspace.slug, threadSlug, { name: newName }).then(() => {
      eventEmitter.emit('workspaceUpdate', {
        type: 'rename-thread',
        details: { workspaceSlug: workspace.slug, threadSlug: threadSlug, newName: newName },
      });
    });
  }

  return (
    <Fragment>
      <TouchableOpacity
        key={workspace.slug}
        onLongPress={handleWorkspaceDelete}
        onPress={changeWorkspace}
        className={`flex-row items-center my-2 px-4 py-3 rounded-lg justify-between items-center ${bgColor}`}
      >
        <View className='flex-row items-center gap-x-1'>
          <DotsSixVertical size={20} weight='bold' color={color} />
          <Text style={{ color, fontWeight: isActive ? 'bold' : 'normal' }} className='text-lg'>{workspace.name}</Text>
        </View>
        {isActive && (
          <View className='flex-row items-center gap-x-2'>
            {/* <UploadSimple size={20} color={color} /> */}
            {/* <Gear size={20} color={color} /> */}
          </View>
        )}
      </TouchableOpacity>
      {isActive && (
        <WorkspaceThreads
          workspace={workspace}
          activeThreadIdx={activeThreadIdx}
          setActiveThreadIdx={setActiveThreadIdx}
          handleThreadDelete={handleThreadDelete}
          setThreadSlug={setThreadSlug}
          setIsRenameModalVisible={setIsRenameModalVisible}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isRenameModalVisible}
        onRequestClose={() => setIsRenameModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-[--primary-bg] rounded-lg p-6 w-4/5">
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
      </Modal>
    </Fragment>
  );
}

function WorkspaceThreads({ workspace, activeThreadIdx, setActiveThreadIdx, handleThreadDelete, setThreadSlug, setIsRenameModalVisible }: { workspace: any, activeThreadIdx: number, setActiveThreadIdx: (idx: number) => void, handleThreadDelete: (slug: string) => void, setThreadSlug: (slug: string) => void, setIsRenameModalVisible: (visible: boolean) => void }) {
  if (!workspace.threads) return null;
  return (
    <View className='flex flex-col items-start justify-left ml-8 pb-10'>
      {workspace.threads?.map((thread: any, idx: number) => {
        const hasPrevious = idx > 0;
        return (
          <ThreadItem
            key={thread.slug}
            isActive={idx === activeThreadIdx}
            thread={thread}
            highlightDownstroke={idx <= activeThreadIdx}
            hasPrevious={hasPrevious}
            onPress={() => {
              setActiveThreadIdx(idx)
              eventEmitter.emit('REDIRECT', {
                path: PATHS.workspace_chat,
                params: { wsSlug: workspace.slug, threadSlug: thread.slug },
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
      <TouchableOpacity
        className="flex-row items-center gap-x-2"
        onPress={() => {
          WorkspaceThread.create({ workspaceSlug: workspace.slug }).then((thread) => {
            eventEmitter.emit('workspaceUpdate', {
              type: 'add-thread',
              details: {
                workspaceSlug: workspace.slug,
                thread,
              },
            });
            eventEmitter.emit('REDIRECT', {
              path: PATHS.workspace_chat,
              params: { wsSlug: workspace.slug, threadSlug: thread.slug },
            });
          });
        }}
      >
        <View className="p-1 rounded-lg bg-white/20">
          <Plus size={14} color='white' />
        </View>
        <Text className="text-lg text-white">New Thread</Text>
      </TouchableOpacity>
    </View>
  )
}

export default WorkspaceItem;