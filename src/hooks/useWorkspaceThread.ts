import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspaceThread(wsSlug: string, threadSlug: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  async function fetchWorkspaceThread() {
    try {
      if (!wsSlug) throw new Error('Workspace slug is required');
      if (!threadSlug) throw new Error('Thread slug is required');

      setIsLoading(true);
      const [workspace, thread] = await Promise.all([
        Workspace.get(wsSlug),
        WorkspaceThread.get(wsSlug, threadSlug)
      ]);
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

  // Listen for workspace updates
  // useEffect(() => {
  //   const workspaceListener = eventEmitter.addListener(
  //     'workspaceUpdate',
  //     (event) => {
  //       if (event.type === 'add-thread') {
  //         const { workspaceSlug, thread } = event.details;
  //         setWorkspace(prev => prev.map(ws => ws.slug === workspaceSlug ? { ...ws, threads: [...(ws?.threads || []), thread] } : ws));
  //         if (workspaceSlug) setWorkspace(workspaceSlug);
  //         if (thread.slug) setThread(thread.slug);
  //         eventEmitter.emit('workspaceThreadPageInfo', { type: 'update', details: { workspace, thread } });
  //         return;
  //       }

  //       if (event.type === 'remove-thread') {
  //         const { workspaceSlug, threadSlug } = event.details;
  //         setWorkspace(prev => prev.map(ws =>
  //           ws.slug === workspaceSlug ? { ...ws, threads: ws.threads.filter(t => t.slug !== threadSlug) } : ws
  //         ));
  //         return;
  //       }

  //       if (event.type === 'rename-thread') {
  //         const { workspaceSlug, threadSlug, newName } = event.details;
  //         setWorkspace(prev => prev.map(ws =>
  //           ws.slug === workspaceSlug ? { ...ws, threads: ws.threads.map(t => t.slug === threadSlug ? { ...t, name: newName } : t) } : ws
  //         ));
  //         return;
  //       }

  //       if (event.type === 'remove-workspace') {
  //         const { workspaceSlug } = event.details;
  //         setWorkspace(prev => prev.filter(ws => ws.slug !== workspaceSlug));
  //         fetchWorkspaceThread()
  //           .then(({ workspace }) => {
  //             if (!workspace) return console.log('no workspaces left - nowhere to go!');
  //             eventEmitter.emit('workspaceThreadPageInfo', { type: 'update', details: { workspace, thread: null } });
  //           });
  //         return;
  //       }

  //       if (event.type === 'add-workspace') {
  //         const { name, slug } = event.details;
  //         setWorkspace(prev => [...prev, { name, slug, threads: [] }]);
  //         fetchWorkspaceThread()
  //           .then(({ workspace }) => {
  //             eventEmitter.emit('workspaceThreadPageInfo', { type: 'update', details: { workspace, thread: null } });
  //           });
  //         return;
  //       }
  //     }
  //   );

  //   // Cleanup listeners on unmount
  //   return () => {
  //     workspaceListener.remove();
  //   };
  // }, []);

  useEffect(() => {
    fetchWorkspaceThread();
  }, [wsSlug, threadSlug]);

  return { loadingWorkspaceThread: isLoading, workspace, thread, fetchWorkspaceThread, error };
}