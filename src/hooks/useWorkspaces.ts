import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspaces(withThreads: boolean = false) {
  const [isLoading, setIsLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState<string | null>(null);
  const [activeThreadSlug, setActiveThreadSlug] = useState<string | null>(null);

  async function fetchWorkspaces(withThreads: boolean = false) {
    try {
      setIsLoading(true);
      const workspaces = await Workspace.find([], withThreads);
      setWorkspaces(workspaces);
      return workspaces;
    } catch (error) {
      console.error('Error fetching workspaces', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const workspaceListener = eventEmitter.addListener(
      'workspaceChatPageInfo',
      (event) => {
        if (event.type === 'update') {
          const { wsSlug, threadSlug } = event.details;
          // console.log("Got page update", { wsSlug, threadSlug });
          if (wsSlug) setActiveWorkspaceSlug(wsSlug);
          if (threadSlug) setActiveThreadSlug(threadSlug);
        }
      }
    );

    const reloadListener = eventEmitter.addListener(
      'reloadWorkspaces',
      () => fetchWorkspaces(withThreads)
    );

    // Emit initial state if we have workspaces
    if (workspaces.length > 0) {
      eventEmitter.emit('workspaceChatPageInfo', {
        type: 'update',
        details: {
          wsSlug: workspaces[0].slug,
          threadSlug: workspaces[0].threads?.[0]?.slug || null,
        },
      });
    }

    return () => {
      workspaceListener.remove();
      reloadListener.remove();
    };
  }, [workspaces]);

  // Listen for workspace updates
  useEffect(() => {
    const workspaceListener = eventEmitter.addListener(
      'workspaceUpdate',
      (event) => {
        if (event.type === 'add-thread') {
          const { workspaceSlug, thread } = event.details;
          setWorkspaces(prev => prev.map(ws => ws.slug === workspaceSlug ? { ...ws, threads: [...(ws?.threads || []), thread] } : ws));
          if (workspaceSlug) setActiveWorkspaceSlug(workspaceSlug);
          if (thread.slug) setActiveThreadSlug(thread.slug);
          eventEmitter.emit('workspaceChatPageInfo', { type: 'update', details: { wsSlug: workspaceSlug, threadSlug: thread.slug } });
          return;
        }

        if (event.type === 'remove-thread') {
          const { workspaceSlug, threadSlug } = event.details;
          setWorkspaces(prev => prev.map(ws =>
            ws.slug === workspaceSlug ? { ...ws, threads: ws.threads.filter(t => t.slug !== threadSlug) } : ws
          ));
          return;
        }

        if (event.type === 'rename-thread') {
          const { workspaceSlug, threadSlug, newName } = event.details;
          setWorkspaces(prev => prev.map(ws =>
            ws.slug === workspaceSlug ? { ...ws, threads: ws.threads.map(t => t.slug === threadSlug ? { ...t, name: newName } : t) } : ws
          ));
          return;
        }

        if (event.type === 'remove-workspace') {
          const { workspaceSlug } = event.details;
          setWorkspaces(prev => prev.filter(ws => ws.slug !== workspaceSlug));
          fetchWorkspaces(true)
            .then((workspaces) => {
              if (workspaces.length === 0) return console.log('no workspaces left - nowhere to go!');
              eventEmitter.emit('workspaceChatPageInfo', { type: 'update', details: { wsSlug: workspaces[0].slug } });
            });
          return;
        }

        if (event.type === 'add-workspace') {
          const { name, slug } = event.details;
          setWorkspaces(prev => [...prev, { name, slug, threads: [] }]);
          fetchWorkspaces(true)
            .then(() => {
              eventEmitter.emit('workspaceChatPageInfo', { type: 'update', details: { wsSlug: slug } });
            });
          return;
        }
      }
    );

    // Cleanup listeners on unmount
    return () => {
      workspaceListener.remove();
    };
  }, []);

  useEffect(() => {
    fetchWorkspaces(withThreads);
  }, []);

  return { loadingWorkspaces: isLoading, workspaces, activeWorkspaceSlug, setActiveWorkspaceSlug, activeThreadSlug, fetchWorkspaces };
}