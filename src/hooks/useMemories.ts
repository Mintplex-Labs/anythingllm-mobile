import { useCallback, useEffect, useState } from 'react';
import uiStore from '@/store/UIStore';
import { type MemoryScope, type MemoryType } from '@/database/models/Memory';
import MemoryManager, { MEMORIES_CHANGED_EVENT } from '@/utils/Memories';

/**
 * State for the manage-memories sheet: the on/off switch plus the global and workspace scoped
 * memories for `workspaceSlug`. Re-reads when memories change anywhere (another sheet, a
 * workspace delete) or the enabled flag is flipped.
 */
export default function useMemories(workspaceSlug: string | null) {
  const [enabled, setEnabledState] = useState(false);
  const [global, setGlobal] = useState<MemoryType[]>([]);
  const [workspace, setWorkspace] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [settings, memories] = await Promise.all([MemoryManager.getSettings(), MemoryManager.list(workspaceSlug)]);
    setEnabledState(settings.enabled);
    setGlobal(memories.global);
    setWorkspace(memories.workspace);
    setLoading(false);
  }, [workspaceSlug]);

  useEffect(() => {
    refresh();
    const changed = uiStore.emitter.addListener(MEMORIES_CHANGED_EVENT, refresh);
    const settings = uiStore.emitter.addListener('memories', refresh);
    return () => {
      changed.remove();
      settings.remove();
    };
  }, [refresh]);

  const setEnabled = useCallback(async (value: boolean) => {
    setEnabledState(value); // optimistic - the storage event re-syncs
    await MemoryManager.setEnabled(value);
  }, []);

  const add = useCallback(async (content: string, scope: MemoryScope) => {
    return MemoryManager.add({ content, scope, workspaceSlug: scope === 'workspace' ? workspaceSlug : null });
  }, [workspaceSlug]);

  const update = useCallback((uuid: string, content: string) => MemoryManager.update(uuid, content), []);
  const remove = useCallback((uuid: string) => MemoryManager.remove(uuid), []);

  return { enabled, loading, global, workspace, setEnabled, add, update, remove, refresh };
}
