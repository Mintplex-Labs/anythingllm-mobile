import { getApp } from '@react-native-firebase/app'
import { getAnalytics, logEvent } from '@react-native-firebase/analytics'
import { isDebugMode } from '@/utils/constants';

/**
 * Telemetry class for logging events to Firebase Analytics
 * There are custom events and standard events
 * Predefined events: https://rnfirebase.io/analytics/usage#predefined-events
 * Reserved events: https://rnfirebase.io/analytics/usage#reserved-events
 */
class Telemetry {
    private static instance: Telemetry;
    private analytics: ReturnType<typeof getAnalytics> | null = null;

    /**
     * Custom events are events that are not predefined by Firebase Analytics
     * We set them here so it is easier to manage and track them across the app
     */
    CUSTOM_EVENTS = {
        ONBOARDING: {
            COMPLETED: 'onboarding_completed',
            SURVEY_RESPONSE: 'onboarding_survey_response',
        },
        ACTIONS: {
            WORKSPACE_CREATED: 'workspace_created',
            CHAT_COMPLETED: 'chat_completed',
            DOCUMENT_IMPORTED: 'document_added',
            TOOL_CALLED: 'tool_called',
            LLM_SETTINGS_UPDATED: 'llm_settings_updated',

            /** The user use the QR code to connect to an AnythingLLM intance */
            EXTERNAL_CONNECTION_ESTABLISHED: 'external_connection_established',
            /** External workspace imported from the AnythingLLM Desktop */
            EXTERNAL_WORKSPACE_IMPORTED: 'external_workspace_imported',
            /** External workspace imported from the AnythingLLM Desktop */
        }
    } as const;

    constructor() {
        if (Telemetry.instance) return Telemetry.instance;
        Telemetry.instance = this;
        this.analytics = getAnalytics(getApp());
    }

    log(message: any, ...args: any[]) {
        console.log(`\x1b[32m[Telemetry]\x1b[0m`, message, ...args)
    }

    /**
     * Log a custom event to Firebase Analytics
     * https://rnfirebase.io/analytics/usage#custom-events
     */
    logEvent(name: string, params: Record<string, any> = {}) {
        if (isDebugMode) this.log(`Tracking event: ${name}`, params);
        logEvent(this.analytics!, name, params);
    }
}

const telemetry = new Telemetry();
export default telemetry;