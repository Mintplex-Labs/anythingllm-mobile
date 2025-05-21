import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspaces(withThreads: boolean = false) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState<string | null>(null);

  async function fetchWorkspaces(withThreads: boolean = false) {
    console.log('fetching workspaces...', { withThreads });
    const workspaces = await Workspace.getAll(withThreads);
    setWorkspaces(workspaces);
    return workspaces;
  }

  useEffect(() => {
    const workspaceListener = eventEmitter.addListener(
      'workspaceChatPageInfo',
      (event) => {
        if (event.type === 'update') {
          const { wsSlug } = event.details;
          console.log("Got page update", { wsSlug });
          if (wsSlug) setActiveWorkspaceSlug(wsSlug);
        }
      }
    );

    const reloadListener = eventEmitter.addListener(
      'reloadWorkspaces',
      () => fetchWorkspaces(withThreads)
    );
    return () => {
      workspaceListener.remove();
      reloadListener.remove();
    };
  }, []);

  // Listen for workspace updates
  useEffect(() => {
    const workspaceListener = eventEmitter.addListener(
      'workspaceUpdate',
      (event) => {
        if (event.type === 'add-thread') {
          const { workspaceSlug } = event.details;
          setWorkspaces(prev => prev.map(ws =>
            ws.slug === workspaceSlug ? { ...ws, threads: [...(ws?.threads || []), { name: 'New Thread', slug: `new-thread-${Math.random().toString(36).substring(2, 15)}` }] } : ws
          ));
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

  return { workspaces, activeWorkspaceSlug, fetchWorkspaces };
}