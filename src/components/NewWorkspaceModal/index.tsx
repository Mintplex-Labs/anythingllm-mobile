import Workspace from '@/database/models/Workspace';
import WorkspaceThread from '@/database/models/WorkspaceThread';
import { PATHS } from '@/utils/paths';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  NativeEventEmitter,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from 'react-native';

const eventEmitter = new NativeEventEmitter();
export default function NewWorkspaceModal({ showing, close }: { showing: boolean, close: () => void }) {
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!showing) return;
    // Modal content mounts after the fade-in begins; a short delay lets the
    // native view attach so focus reliably brings up the keyboard.
    const timer = setTimeout(() => inputRef.current?.focus(), Platform.OS === 'android' ? 150 : 50);
    return () => clearTimeout(timer);
  }, [showing]);

  function handleClose() {
    Keyboard.dismiss();
    setName('');
    close();
  }

  async function handleCreateWorkspace() {
    if (creating) return;
    setCreating(true);
    try {
      const workspace = await Workspace.create({ name: name.trim() || 'New Workspace' });
      eventEmitter.emit('workspaceUpdate', {
        type: 'add-workspace',
        details: {
          name: workspace.name,
          slug: workspace.slug,
          createdAt: workspace.createdAt,
        },
      });
      // Workspace.create makes a default thread, but guarantee one exists before navigating.
      const thread = workspace.threads?.[0] ?? await WorkspaceThread.create({ workspaceSlug: workspace.slug });
      handleClose();
      navigation.reset({
        index: 0,
        // @ts-ignore
        routes: [{ name: PATHS.workspace_chat, params: { wsSlug: workspace.slug, threadSlug: thread.slug } }],
      });
    } catch (e) {
      console.error('NewWorkspaceModal:handleCreateWorkspace', e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showing}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Pressable className="flex-1 justify-center items-center bg-black/60 px-6" onPress={handleClose}>
          <Pressable className="bg-[--hex-gray-10] border border-white/10 rounded-2xl p-6 w-full max-w-[420px]" onPress={() => {}}>
            <Text className="text-xl font-bold mb-1 text-white">New Workspace</Text>
            <Text className="text-sm text-white/60 mb-4">Give your workspace a name. You can change it later.</Text>
            <TextInput
              ref={inputRef}
              className="border border-white/20 bg-white/5 rounded-xl px-4 py-3.5 mb-5 text-base !text-white placeholder:text-white/40"
              style={{ minHeight: 48 }}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Research, Work, Personal"
              placeholderTextColor="rgba(255,255,255,0.4)"
              returnKeyType="done"
              onSubmitEditing={handleCreateWorkspace}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={60}
            />
            <View className="flex-row justify-end gap-x-3">
              <TouchableOpacity
                activeOpacity={0.7}
                className="px-5 py-3 rounded-xl bg-transparent"
                onPress={handleClose}
              >
                <Text className="text-white/60 text-base">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={creating}
                className={`px-5 py-3 rounded-xl bg-white ${creating ? 'opacity-50' : ''}`}
                onPress={handleCreateWorkspace}
              >
                <Text className="text-black font-semibold text-base">Create</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
