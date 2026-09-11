import uiStore from "@/store/UIStore";
import { useEffect, useState } from "react";

/**
 * Hook to check if the onboarding is completed
 * Note: this will also listen for the ONBOARDING_COMPLETED event and update the onboardingCompleted state
 * so that we remove the onboarding screens from the navigation stack when no longer needed
 */
export function useOnboardingCompleted(): {
    /**
     * Whether the onboarding is still loading
     */
    loadingOnboardingCompleted: boolean,
    /**
     * Whether the onboarding is completed
     */
    onboardingCompleted: boolean,
} {
    const [loading, setLoading] = useState(true);
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);
    useEffect(() => {
        uiStore.getFromStorage('onboarding_welcome_completed', false)
            .then(isOnboardingCompleted => setOnboardingCompleted(isOnboardingCompleted))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const onCompleted = () => setOnboardingCompleted(true);
        const onReset = () => setOnboardingCompleted(false);
        const completedSub = uiStore.emitter.addListener(uiStore.globalEvents.ONBOARDING_COMPLETED, onCompleted);
        const resetSub = uiStore.emitter.addListener(uiStore.globalEvents.ONBOARDING_RESET, onReset);
        // Remove only this hook instance's subscriptions so other mounted
        // consumers (e.g. the root navigator) keep receiving these events.
        return () => {
            completedSub.remove();
            resetSub.remove();
        };
    }, []);
    return { loadingOnboardingCompleted: loading, onboardingCompleted };
}
