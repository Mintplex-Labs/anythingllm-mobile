import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import uiStore from "@/store/UIStore";
import { ACTIVE_CHAT_LOCATION_KEY } from "./useChatInfoEmit";

const eventEmitter = new NativeEventEmitter();

/** The chat screen currently open, if one has mounted yet */
function currentChatLocation(): { wsSlug: string | null, threadSlug: string | null } {
  const location = uiStore.session.get(ACTIVE_CHAT_LOCATION_KEY);
  return { wsSlug: location?.wsSlug ?? null, threadSlug: location?.threadSlug ?? null };
}

export default function useWorkspaces(withThreads: boolean = false) {
  const [isLoading, setIsLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  // Seed from the open chat so a sidebar that mounts after the chat screen still knows where we are.
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState<string | null>(() => currentChatLocation().wsSlug);
  const [activeThreadSlug, setActiveThreadSlug] = useState<string | null>(() => currentChatLocation().threadSlug);

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

    // Only when no chat screen has told us where we are do we default to the first
    // workspace. Emitting workspaces[0] unconditionally here used to overwrite the
    // real location every time the list loaded.
    if (workspaces.length > 0) {
      const known = currentChatLocation();
      if (!known.wsSlug && !activeWorkspaceSlug) {
        setActiveWorkspaceSlug(workspaces[0].slug);
        setActiveThreadSlug(workspaces[0].threads?.[0]?.slug || null);
      } else if (known.wsSlug && known.wsSlug !== activeWorkspaceSlug) {
        setActiveWorkspaceSlug(known.wsSlug);
        setActiveThreadSlug(known.threadSlug);
      }
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