import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspaceThread(wsSlug: string, threadSlug: string | null) {
  const [isLoading, setIsLoading] = useState(true);
  const [workspace, setWorkspace] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  async function fetchWorkspaceThread() {
    try {
      setIsLoading(true);
      setError(null);
      if (!wsSlug) throw new Error('Workspace slug is required');
      if (!threadSlug) throw new Error('Thread slug is required');

      const [workspace, thread] = await Promise.all([
        Workspace.first([{ field: 'slug', value: wsSlug }]),
        WorkspaceThread.first([{ field: 'workspace_slug', value: wsSlug }, { field: 'slug', value: threadSlug }])
      ]);
      // `first` returns null rather than throwing - the chat screen assumes both exist, so surface it as an error
      if (!workspace) throw new Error('This workspace no longer exists');
      if (!thread) throw new Error('This thread no longer exists');

      setWorkspace(workspace);
      setThread(thread);
      return { workspace, thread };
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
          if (thread) setThread(thread);
        }
      }
    );

    const reloadListener = eventEmitter.addListener(
      'reloadWorkspaceThread',
      () => fetchWorkspaceThread()
    );

    // Emit initial state if we have workspaces
    if (workspace && thread) {
      eventEmitter.emit('workspaceThreadPageInfo', {
        type: 'update',
        details: {
          workspace,
          thread,
        },
      });
    }

    return () => {
      workspaceListener.remove();
      reloadListener.remove();
    };
  }, [workspace, thread]);

  useEffect(() => {
    fetchWorkspaceThread();
  }, [wsSlug, threadSlug]);

  return { loadingWorkspaceThread: isLoading, workspace, thread, fetchWorkspaceThread, error };
}