import { useEffect, useState } from "react";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import uiStore from "@/store/UIStore";

export default function useWorkspace(wsSlug: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceType>();
  const [error, setError] = useState<any>(null);

  async function fetchWorkspace() {
    try {
      if (!wsSlug) throw new Error('Workspace slug is required');
      const workspace = await Workspace.first([{ field: 'slug', value: wsSlug }]);
      if (!workspace) throw new Error('Workspace not found');
      setWorkspace(workspace);
      return { workspace };
    } catch (error) {
      console.error('Error fetching workspaces', error);
      setError(error);
      return { workspace: null, thread: null };
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkspace();
  }, [wsSlug]);

  useEffect(() => {
    const workspaceListener = uiStore.emitter.addListener(
      'workspaceUpdate',
      (event) => {
        if (event.type === 'update') {
          const { workspace } = event.details;
          if (workspace.slug === wsSlug) setWorkspace(workspace);
        }
      }
    );
    return () => workspaceListener.remove();
  }, [wsSlug]);

  return { loadingWorkspace: isLoading, workspace, fetchWorkspace, error };
}