import Workspace from '@/database/models/Workspace';
import React, { useState } from 'react';
import { View, TouchableOpacity, Text, NativeEventEmitter, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';

const eventEmitter = new NativeEventEmitter();
export default function NewWorkspaceModal({ showing, close }: { showing: boolean, close: () => void }) {
  const [name, setName] = useState("");

  async function handleCreateWorkspace() {
    await Workspace.create({ name: name || 'New Workspace' })
      .then((workspace) => {
        eventEmitter.emit('workspaceUpdate', {
          type: 'add-workspace',
          details: {
            name: workspace.name,
            slug: workspace.slug,
            createdAt: workspace.createdAt,
          },
        });
        close();
        setName('');

        // @ts-ignore
        navigation.navigate(PATHS.workspace_chat, { wsSlug: workspace.slug });
      });
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showing}
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-[--primary-bg] rounded-lg p-6 w-4/5">
            <Text className="text-xl font-bold mb-4 text-[--primary-text]">New Workspace</Text>
            <TextInput
              className="border border-white/20 rounded-lg p-2 mb-4 text-[--secondary-bg] !text-white placeholder:text-white/50"
              value={name}
              onChangeText={setName}
              placeholder="Enter new workspace name"
            />
            <View className="flex-row justify-between gap-x-2">
              <TouchableOpacity
                className="px-4 py-2 rounded-lg bg-transparent"
                onPress={close}
              >
                <Text className="text-white/50">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-4 py-2 rounded-lg bg-transparent border border-white"
                onPress={handleCreateWorkspace}
              >
                <Text className="text-white">Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function useNewWorkspaceModal() {
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);

  function open() {
    setShowNewWorkspaceModal(true);
  }

  function close() {
    setShowNewWorkspaceModal(false);
  }

  return { showNewWorkspaceModal, openNewWorkspaceModal: open, closeNewWorkspaceModal: close };
}