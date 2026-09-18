import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { PencilSimple, Trash } from 'phosphor-react-native';
import ToggleSwitch from '@/components/ToggleSwitch';
import AwaitableAlert from '@/components/AwaitableAlert';
import { SheetHeader, DANGER, MUTED_TEXT, ROW_ICON_BACKGROUND } from '@/components/SheetMenu';
import Memory, { type MemoryScope, type MemoryType } from '@/database/models/Memory';
import { type WorkspaceType } from '@/database/models/Workspace';
import useMemories from '@/hooks/useMemories';
import { showToast } from '@/utils/Notification';

const SCOPE_COPY: Record<MemoryScope, { tab: string; hint: string; placeholder: string; empty: string }> = {
  global: {
    tab: 'Everywhere',
    hint: 'Facts about you the model should always know - your name, what you do, how you like answers. Sent with every chat in every workspace. Keep them short so they all fit on small models.',
    placeholder: 'e.g. My name is Sam. I write Python and prefer short answers.',
    empty: 'No memories yet. Add a fact about yourself above.',
  },
  workspace: {
    tab: 'This workspace',
    hint: 'Notes that only matter here - the project, its jargon, decisions already made. Managed and injected dynamically.',
    placeholder: 'e.g. This project is a React Native app called Orbit. Use yarn, not npm.',
    empty: 'No workspace memories yet. Add a note about this workspace above.',
  },
};

/**
 * "Manage Memories" page of the thread menu. A master switch, a scope picker (global vs the
 * current workspace), an input to add or edit a memory and the list of what is saved. Every
 * memory is typed by the user - nothing is inferred from the chat.
 */
export default function MemoriesPage({ workspace, onBack }: { workspace: WorkspaceType; onBack: () => void }) {
  const isRemote = !!workspace.isRemote;
  const { enabled, loading, global, workspaceMemories, setEnabled, add, update, remove } = useMemoriesForPage(workspace.slug);
  const [scope, setScope] = useState<MemoryScope>('global');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<MemoryType | null>(null);
  const [saving, setSaving] = useState(false);

  // Remote workspaces are answered by the user's AnythingLLM server, which has no access to these
  // memories - so only the global list (used by every local workspace) is offered there.
  useEffect(() => {
    if (isRemote && scope === 'workspace') setScope('global');
  }, [isRemote, scope]);

  const memories = scope === 'global' ? global : workspaceMemories;
  const copy = SCOPE_COPY[scope];
  const trimmed = draft.replace(/\s+/g, ' ').trim();
  const canSave = !saving && trimmed.length >= Memory.minContentLength && trimmed.length <= Memory.maxContentLength;

  const resetInput = () => {
    setDraft('');
    setEditing(null);
  };

  const handleScopeChange = (next: MemoryScope) => {
    if (next === scope) return;
    setScope(next);
    resetInput();
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await update(editing.uuid, trimmed);
        if (!updated) showToast('That memory no longer exists', 'long');
      } else {
        await add(trimmed, scope);
      }
      resetInput();
    } catch (error: any) {
      showToast(error?.message ?? 'Could not save memory', 'long');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (memory: MemoryType) => {
    setEditing(memory);
    setDraft(memory.content);
  };

  const handleDelete = async (memory: MemoryType) => {
    const confirmed = await AwaitableAlert(
      'Delete memory?',
      `"${memory.content}"`,
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    );
    if (!confirmed) return;
    if (editing?.uuid === memory.uuid) resetInput();
    await remove(memory.uuid);
  };

  return (
    <View>
      <SheetHeader title="Memories" onBack={onBack} />

      <View className="flex flex-row items-center justify-between" style={{ marginBottom: 6 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text className="text-white text-[15px] font-semibold">Enable memories</Text>
          <Text style={{ color: MUTED_TEXT }} className="text-sm">
            Allow injection of facts about you or this workspace.
          </Text>
        </View>
        {loading ? <ActivityIndicator color="#FFF" /> : <ToggleSwitch isOn={enabled} onToggle={() => setEnabled(!enabled)} />}
      </View>

      {enabled && (
        <View style={{ marginTop: 18, gap: 14 }}>
          <ScopeTabs scope={scope} onChange={handleScopeChange} hideWorkspace={isRemote} />
          <Text style={{ color: MUTED_TEXT }} className="text-sm">{copy.hint}</Text>
          {isRemote && (
            <Text style={{ color: MUTED_TEXT }} className="text-xs">
              This workspace is answered by your AnythingLLM server, so memories are not used in its chats. Global memories still apply to your on-device and cloud workspaces.
            </Text>
          )}

          <View style={{ backgroundColor: ROW_ICON_BACKGROUND, borderRadius: 12, padding: 12, gap: 8 }}>
            <BottomSheetTextInput
              multiline
              value={draft}
              onChangeText={setDraft}
              placeholder={copy.placeholder}
              placeholderTextColor={MUTED_TEXT}
              maxLength={Memory.maxContentLength + 50}
              style={{ color: '#FFF', fontSize: 15, minHeight: 44, maxHeight: 120, paddingTop: 0, paddingBottom: 0 }}
              accessibilityLabel={editing ? 'Edit memory' : 'New memory'}
            />
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: trimmed.length > Memory.maxContentLength ? DANGER : MUTED_TEXT }} className="text-xs">
                {trimmed.length}/{Memory.maxContentLength}
              </Text>
              <View className="flex flex-row items-center" style={{ gap: 14 }}>
                {editing && (
                  <TouchableOpacity onPress={resetInput} hitSlop={8}>
                    <Text style={{ color: MUTED_TEXT }} className="text-sm">Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={!canSave}
                  style={{ backgroundColor: '#FFF', opacity: canSave ? 1 : 0.4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  accessibilityRole="button">
                  {saving ? <ActivityIndicator color="#000" size="small" /> : (
                    <Text className="text-black text-sm font-semibold">{editing ? 'Update' : 'Save'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            {memories.length === 0 ? (
              <Text style={{ color: MUTED_TEXT, paddingVertical: 8 }} className="text-sm">{copy.empty}</Text>
            ) : (
              memories.map((memory) => (
                <MemoryRow
                  key={memory.uuid}
                  memory={memory}
                  active={editing?.uuid === memory.uuid}
                  onEdit={() => handleEdit(memory)}
                  onDelete={() => handleDelete(memory)}
                />
              ))
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/** Thin adapter so the page reads `workspaceMemories` instead of shadowing the `workspace` prop. */
function useMemoriesForPage(workspaceSlug: string) {
  const { workspace, ...rest } = useMemories(workspaceSlug);
  return { ...rest, workspaceMemories: workspace };
}

function ScopeTabs({ scope, onChange, hideWorkspace }: { scope: MemoryScope; onChange: (scope: MemoryScope) => void; hideWorkspace: boolean }) {
  const scopes: MemoryScope[] = hideWorkspace ? ['global'] : ['global', 'workspace'];
  return (
    <View className="flex flex-row" style={{ backgroundColor: ROW_ICON_BACKGROUND, borderRadius: 10, padding: 3 }}>
      {scopes.map((value) => {
        const selected = value === scope;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => onChange(value)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: selected ? '#FFF' : 'transparent' }}
            className="flex items-center justify-center"
            accessibilityRole="tab"
            accessibilityState={{ selected }}>
            <Text style={{ color: selected ? '#000' : '#FFF' }} className="text-sm font-semibold">{SCOPE_COPY[value].tab}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MemoryRow({ memory, active, onEdit, onDelete }: { memory: MemoryType; active: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <View
      className="flex flex-row items-center"
      style={{ gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2E', opacity: active ? 0.6 : 1 }}>
      <Text className="text-white text-[15px]" style={{ flex: 1 }}>{memory.content}</Text>
      <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityLabel="Edit memory">
        <PencilSimple size={20} color={MUTED_TEXT} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityLabel="Delete memory">
        <Trash size={20} color={DANGER} />
      </TouchableOpacity>
    </View>
  );
}
