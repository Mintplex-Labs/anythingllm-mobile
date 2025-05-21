import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useState, useEffect } from "react";

const DEFAULT_INITIAL_ROUTE = PATHS.home;

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
export default function useInitialRoute(): { initialRoute: string, isLoading: boolean } {
  const [initialRoute, setInitialRoute] = useState<string>(DEFAULT_INITIAL_ROUTE);
  const [isLoading, setIsLoading] = useState(true);

  // Debugging for storage
  uiStore.getAllFromStorage().then(console.log);

  useEffect(() => {
    determineInitialRoute()
      .then((initialRoute) => {
        setInitialRoute(initialRoute);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return { initialRoute, isLoading };
}