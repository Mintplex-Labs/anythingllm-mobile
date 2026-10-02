import uiStore from "@/store/UIStore";
import Workspace from "@/database/models/Workspace";
import { useEffect, useState } from "react";

let repairing: Promise<void> | null = null;

/**
 * The navigator used to treat onboarding as done once its first step was, so quitting partway through dropped the
 * user into the app with the last step never recorded - and the assistant, Quick Actions, sharing and deep links
 * kept asking them to finish setup. Data handling (the last step) creates the first workspace, so anyone who has one
 * without the flag got in that way: record the remaining steps as done. Everyone else resumes onboarding.
 * Runs once per launch; both launch hooks await it before reading the onboarding flags.
 */
export function repairPartialOnboarding(): Promise<void> {
    if (!repairing) repairing = (async () => {
        const welcomeCompleted = await uiStore.getFromStorage('onboarding_welcome_completed', false);
        const dataHandlingCompleted = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
        if (!welcomeCompleted || dataHandlingCompleted) return;
        if (!(await Workspace.first())) return;
        await Promise.all([
            uiStore.setToStorage('onboarding_model_selection_completed', true),
            uiStore.setToStorage('onboarding_survey_completed', true),
            uiStore.setToStorage('onboarding_data_handling_completed', true),
        ]);
    })().catch((e) => console.error('[Onboarding] could not repair partial onboarding', e));
    return repairing;
}

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
        // The last step, not the first: until it is recorded the onboarding screens must stay in the navigator,
        // or a relaunch mid-onboarding would land on Home with setup never finished.
        repairPartialOnboarding()
            .then(() => uiStore.getFromStorage('onboarding_data_handling_completed', false))
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
