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
import { useTranslation } from 'react-i18next';
import { tKey } from '@/i18n';

const SCOPE_COPY: Record<MemoryScope, { tab: string; hint: string; placeholder: string; empty: string }> = {
  global: {
    tab: tKey('top_bar.memories.global.tab'),
    hint: tKey('top_bar.memories.global.hint'),
    placeholder: tKey('top_bar.memories.global.placeholder'),
    empty: tKey('top_bar.memories.global.empty'),
  },
  workspace: {
    tab: tKey('top_bar.memories.workspace.tab'),
    hint: tKey('top_bar.memories.workspace.hint'),
    placeholder: tKey('top_bar.memories.workspace.placeholder'),
    empty: tKey('top_bar.memories.workspace.empty'),
  },
};

/**
 * "Manage Memories" page of the thread menu. A master switch, a scope picker (global vs the
 * current workspace), an input to add or edit a memory and the list of what is saved. Every
 * memory is typed by the user - nothing is inferred from the chat.
 */
export default function MemoriesPage({ workspace, onBack }: { workspace: WorkspaceType; onBack: () => void }) {
  const { t } = useTranslation();
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
        if (!updated) showToast(t('top_bar.memories.no_longer_exists'), 'long');
      } else {
        await add(trimmed, scope);
      }
      resetInput();
    } catch (error: any) {
      showToast(error?.message ?? t('top_bar.memories.save_failed'), 'long');
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
      t('top_bar.memories.delete_title'),
      `"${memory.content}"`,
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive' },
    );
    if (!confirmed) return;
    if (editing?.uuid === memory.uuid) resetInput();
    await remove(memory.uuid);
  };

  return (
    <View>
      <SheetHeader title={t('top_bar.thread_menu.memories')} onBack={onBack} />

      <View className="flex flex-row items-center justify-between" style={{ marginBottom: 6 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text className="text-white text-[15px] font-semibold">{t('top_bar.memories.enable')}</Text>
          <Text style={{ color: MUTED_TEXT }} className="text-sm">
            {t('top_bar.memories.enable_description')}
          </Text>
        </View>
        {loading ? <ActivityIndicator color="#FFF" /> : <ToggleSwitch isOn={enabled} onToggle={() => setEnabled(!enabled)} />}
      </View>

      {enabled && (
        <View style={{ marginTop: 18, gap: 14 }}>
          <ScopeTabs scope={scope} onChange={handleScopeChange} hideWorkspace={isRemote} />
          <Text style={{ color: MUTED_TEXT }} className="text-sm">{t(copy.hint)}</Text>
          {isRemote && (
            <Text style={{ color: MUTED_TEXT }} className="text-xs">
              {t('top_bar.memories.remote_notice')}
            </Text>
          )}

          <View style={{ backgroundColor: ROW_ICON_BACKGROUND, borderRadius: 12, padding: 12, gap: 8 }}>
            <BottomSheetTextInput
              multiline
              value={draft}
              onChangeText={setDraft}
              placeholder={t(copy.placeholder)}
              placeholderTextColor={MUTED_TEXT}
              maxLength={Memory.maxContentLength + 50}
              style={{ color: '#FFF', fontSize: 15, minHeight: 44, maxHeight: 120, paddingTop: 0, paddingBottom: 0 }}
              accessibilityLabel={editing ? t('top_bar.memories.edit_memory') : t('top_bar.memories.new_memory')}
            />
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: trimmed.length > Memory.maxContentLength ? DANGER : MUTED_TEXT }} className="text-xs">
                {trimmed.length}/{Memory.maxContentLength}
              </Text>
              <View className="flex flex-row items-center" style={{ gap: 14 }}>
                {editing && (
                  <TouchableOpacity onPress={resetInput} hitSlop={8}>
                    <Text style={{ color: MUTED_TEXT }} className="text-sm">{t('common.cancel')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={!canSave}
                  style={{ backgroundColor: '#FFF', opacity: canSave ? 1 : 0.4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  accessibilityRole="button">
                  {saving ? <ActivityIndicator color="#000" size="small" /> : (
                    <Text className="text-black text-sm font-semibold">{editing ? t('common.update') : t('common.save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ gap: 4 }}>
            {memories.length === 0 ? (
              <Text style={{ color: MUTED_TEXT, paddingVertical: 8 }} className="text-sm">{t(copy.empty)}</Text>
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
  const { t } = useTranslation();
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
            <Text style={{ color: selected ? '#000' : '#FFF' }} className="text-sm font-semibold">{t(SCOPE_COPY[value].tab)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MemoryRow({ memory, active, onEdit, onDelete }: { memory: MemoryType; active: boolean; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      className="flex flex-row items-center"
      style={{ gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2E', opacity: active ? 0.6 : 1 }}>
      <Text className="text-white text-[15px]" style={{ flex: 1 }}>{memory.content}</Text>
      <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityLabel={t('top_bar.memories.edit_memory')}>
        <PencilSimple size={20} color={MUTED_TEXT} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityLabel={t('top_bar.memories.delete_memory')}>
        <Trash size={20} color={DANGER} />
      </TouchableOpacity>
    </View>
  );
}
