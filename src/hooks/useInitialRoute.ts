import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useState, useEffect } from "react";
import Workspace from "@/database/models/Workspace";
import WorkspaceThread from "@/database/models/WorkspaceThread";

const DEFAULT_INITIAL_ROUTE = PATHS.home;

type InitialRoute = {
  path: string;
  params?: { [key: string]: any };
};

async function determineInitialRoute() {
  const welcomeCompleted = await uiStore.getFromStorage('onboarding_welcome_completed', false);
  const modelSelectionCompleted = await uiStore.getFromStorage('onboarding_model_selection_completed', false);
  if (!welcomeCompleted) return PATHS.onboarding.welcome;
  else if (!modelSelectionCompleted) return PATHS.onboarding.model_selection;
  else return DEFAULT_INITIAL_ROUTE;
}

/**
 * Determines if the user needs to be redirected to the onboarding flow or the home screen
 * on app load.
 */
export default function useInitialRoute(): { initialRoute: InitialRoute, isLoading: boolean } {
  const [initialRoute, setInitialRoute] = useState<InitialRoute>({
    path: DEFAULT_INITIAL_ROUTE,
    params: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  // Debugging for storage
  uiStore.getAllFromStorage().then(console.log);

  useEffect(() => {
    async function checkForInitialRoute() {
      const staticRoute = await determineInitialRoute();

      const workspaces = await Workspace.getAll(true);
      if (workspaces.length === 0) {
        setInitialRoute({ path: staticRoute, params: {} });
        setIsLoading(false);
        return;
      }

      const workspace = workspaces[0];
      const thread = workspace.threads[0] || await WorkspaceThread.create({ workspaceSlug: workspace.slug });
      setInitialRoute({ path: PATHS.workspace_chat, params: { wsSlug: workspace.slug, threadSlug: thread.slug } });
      setIsLoading(false);
      return;
    }

    checkForInitialRoute();
    // determineInitialRoute()
    //   .then((initialRoute) => {
    //     setInitialRoute(initialRoute);
    //   })
    //   .finally(() => setIsLoading(false));
  }, []);

  return { initialRoute, isLoading };
}