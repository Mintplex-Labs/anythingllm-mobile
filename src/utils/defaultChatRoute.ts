import Workspace from "@/database/models/Workspace";
import WorkspaceChat from "@/database/models/WorkspaceChat";
import WorkspaceThread from "@/database/models/WorkspaceThread";

export type ChatRouteParams = { wsSlug: string; threadSlug: string };

function log(message: string, ...args: any[]) {
  console.log(`\x1b[35m[DefaultChatRoute]\x1b[0m ${message}`, ...args);
}

/**
 * The thread that received the most recent chat message, provided both it and
 * its workspace still exist. Derived from the chats table rather than a stored
 * pointer so it can never point at something that was deleted.
 */
async function lastChattedThread(): Promise<ChatRouteParams | null> {
  const latestChat = await WorkspaceChat.latest();
  if (!latestChat?.workspaceThreadSlug) return null;

  const thread = await WorkspaceThread.first([{ field: 'slug', value: latestChat.workspaceThreadSlug }]);
  if (!thread?.workspaceSlug) return null;

  const workspace = await Workspace.first([{ field: 'slug', value: thread.workspaceSlug }]);
  if (!workspace) return null;

  return { wsSlug: workspace.slug, threadSlug: thread.slug };
}

/**
 * Where the app should open when the user has workspaces:
 *  1. the thread they last sent a message in
 *  2. otherwise the first workspace's first thread (created if missing)
 * Returns null only when no workspaces exist - the one case the Home screen is for.
 */
export async function resolveDefaultChatRoute(): Promise<ChatRouteParams | null> {
  try {
    const lastChatted = await lastChattedThread();
    if (lastChatted) {
      log('Opening last chatted thread', lastChatted);
      return lastChatted;
    }

    const workspaces = await Workspace.find([], true);
    if (workspaces.length === 0) {
      log('No workspaces exist - staying on Home');
      return null;
    }

    const workspace = workspaces[0];
    const thread = workspace.threads?.[0] || await WorkspaceThread.create({ workspaceSlug: workspace.slug });
    const route = { wsSlug: workspace.slug, threadSlug: thread.slug };
    log('No chats yet - opening first workspace thread', route);
    return route;
  } catch (error) {
    console.error('[DefaultChatRoute] Failed to resolve default chat route', error);
    return null;
  }
}
