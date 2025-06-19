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
  const surveyCompleted = await uiStore.getFromStorage('onboarding_survey_completed', false);
  const dataHandlingCompleted = await uiStore.getFromStorage('onboarding_data_handling_completed', false);

  if (!welcomeCompleted) return PATHS.onboarding.welcome;
  else if (!modelSelectionCompleted) return PATHS.onboarding.model_selection;
  else if (!surveyCompleted) return PATHS.onboarding.survey;
  else if (!dataHandlingCompleted) return PATHS.onboarding.data_handling;
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
  // uiStore.getAllFromStorage().then(console.log);

  useEffect(() => {
    async function checkForInitialRoute() {
      const staticRoute = await determineInitialRoute();

      // If the user is not onboarded, we need to redirect them to the onboarding flow
      if (staticRoute !== DEFAULT_INITIAL_ROUTE) {
        setInitialRoute({ path: staticRoute, params: {} });
        setIsLoading(false);
        return;
      }

      // If the user is onboarded and has no workspaces, we need to redirect them to the onboarding flow
      const workspaces = await Workspace.find([], true);
      if (workspaces.length === 0) {
        setInitialRoute({ path: staticRoute, params: {} });
        setIsLoading(false);
        return;
      }

      // If the user is onboarded and has workspaces, we need to redirect them to the workspace chat of the first workspace/thread
      const workspace = workspaces[0];
      const thread = workspace.threads?.[0] || await WorkspaceThread.create({ workspaceSlug: workspace.slug });
      setInitialRoute({ path: PATHS.workspace_chat, params: { wsSlug: workspace.slug, threadSlug: thread.slug } });
      setIsLoading(false);
      return;
    }

    checkForInitialRoute();
  }, []);

  return { initialRoute, isLoading };
}