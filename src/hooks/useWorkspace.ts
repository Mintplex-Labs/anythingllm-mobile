import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspace(wsSlug: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  async function fetchWorkspace() {
    try {
      if (!wsSlug) throw new Error('Workspace slug is required');

      setIsLoading(true);
      const workspace = await Workspace.find(wsSlug);
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
    const workspaceListener = eventEmitter.addListener(
      'workspaceThreadPageInfo',
      (event) => {
        if (event.type === 'update') {
          const { workspace, thread } = event.details;
          // console.log("Got page update", { workspace, thread });
          if (workspace) setWorkspace(workspace);
        }
      }
    );

    const reloadListener = eventEmitter.addListener(
      'reloadWorkspace',
      () => fetchWorkspace()
    );

    // Emit initial state if we have workspaces
    if (workspace) {
      eventEmitter.emit('workspacePageInfo', {
        type: 'update',
        details: {
          workspace,
        },
      });
    }

    return () => {
      workspaceListener.remove();
      reloadListener.remove();
    };
  }, [workspace]);

  useEffect(() => {
    fetchWorkspace();
  }, [wsSlug]);

  return { loadingWorkspace: isLoading, workspace, fetchWorkspace, error };
}