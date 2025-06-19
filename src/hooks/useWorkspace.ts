import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";

const eventEmitter = new NativeEventEmitter();
export default function useWorkspace(wsSlug: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceType>();
  const [error, setError] = useState<any>(null);

  async function fetchWorkspace() {
    try {
      if (!wsSlug) throw new Error('Workspace slug is required');
      const workspace = await Workspace.find(wsSlug);
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

  return { loadingWorkspace: isLoading, workspace, fetchWorkspace, error };
}