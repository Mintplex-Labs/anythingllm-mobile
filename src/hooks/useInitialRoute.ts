import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useState, useEffect } from "react";
import { resolveDefaultChatRoute } from "@/utils/defaultChatRoute";

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

      // Onboarded: open the thread they last chatted in (or the first workspace's
      // thread). Home is only for the no-workspaces case - it also re-checks this
      // itself on mount, so landing there with workspaces self-corrects.
      const chatRoute = await resolveDefaultChatRoute();
      const route: InitialRoute = chatRoute
        ? { path: PATHS.workspace_chat, params: chatRoute }
        : { path: staticRoute, params: {} };
      console.log('[InitialRoute]', route.path, route.params);
      setInitialRoute(route);
      setIsLoading(false);
    }

    checkForInitialRoute();
  }, []);

  return { initialRoute, isLoading };
}
