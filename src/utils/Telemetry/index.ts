import { getApp } from '@react-native-firebase/app'
import { getAnalytics, logEvent, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDebugMode } from '@/utils/constants';

/** AsyncStorage key holding "false" once the user opts out under Settings > Utility > Anonymous telemetry */
const TELEMETRY_ENABLED_KEY = 'anythingllm_telemetry_enabled';

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
     * Cached opt-out state so `logEvent` can bail synchronously. Defaults to enabled and is
     * hydrated from storage on construction; only an explicit "false" turns it off.
     */
    private enabled = true;
    private ready: Promise<void> = Promise.resolve();

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
            /** The user pressed stop while a reply was generating - nothing was saved */
            CHAT_ABORTED: 'chat_aborted',
            /** A document was attached to a workspace (payload: documentType, mode = embedded | full) */
            DOCUMENT_IMPORTED: 'document_added',
            /** An image was attached to a prompt from the gallery, the camera or the share sheet (payload: source) */
            IMAGE_ATTACHED: 'image_attached',
            /** Another app shared files/images to AnythingLLM through the share sheet (payload: files, images) */
            CONTENT_SHARED: 'content_shared',
            /** Text highlighted in another app was sent to the Quick Actions card (payload: mode, action) */
            QUICK_CONTEXT_USED: 'quick_context_used',
            /** The selection-toolbar entry was switched on or off in Settings > Special tools (payload: enabled) */
            QUICK_CONTEXT_TOGGLED: 'quick_context_toggled',
            TOOL_CALLED: 'tool_called',
            LLM_SETTINGS_UPDATED: 'llm_settings_updated',
            /** A chat thread was exported (txt/md/json/pdf) and handed to the share sheet */
            THREAD_EXPORTED: 'thread_exported',
            /** A chat thread was forked into a new thread with a copy of its history */
            THREAD_FORKED: 'thread_forked',
            /** A user/assistant message pair was deleted from a thread */
            CHAT_DELETED: 'chat_deleted',
            /** A user/assistant message pair was removed and its prompt re-submitted */
            CHAT_RETRIED: 'chat_retried',
            /** The user switched the memory system on (disabling is not tracked) */
            MEMORIES_ENABLED: 'memories_enabled',
            /** The user saved a memory from the thread menu (payload: scope) */
            MEMORY_SAVED: 'memory_saved',
            /** A scheduled job was created (payload: tools count, notify) */
            SCHEDULED_JOB_CREATED: 'scheduled_job_created',
            SCHEDULED_JOB_RAN: 'scheduled_job_ran',
            /** The feature highlights carousel was dismissed (payload: audience new_user|upgrade, cards) */
            HIGHLIGHTS_VIEWED: 'highlights_viewed',

            /** The user use the QR code to connect to an AnythingLLM intance */
            EXTERNAL_CONNECTION_ESTABLISHED: 'external_connection_established',
            /** External workspace imported from the AnythingLLM Desktop */
            EXTERNAL_WORKSPACE_IMPORTED: 'external_workspace_imported',
        },
        /** The user switched anonymous telemetry off - the final event we send before going quiet */
        DISABLED_TELEMETRY: 'disabled_telemetry',
    } as const;

    constructor() {
        if (Telemetry.instance) return Telemetry.instance;
        Telemetry.instance = this;
        this.analytics = getAnalytics(getApp());
        this.ready = AsyncStorage.getItem(TELEMETRY_ENABLED_KEY)
            .then((value) => {
                this.enabled = value !== 'false';
                if (!this.enabled) return setAnalyticsCollectionEnabled(this.analytics!, false);
            })
            .catch((e) => console.error('[Telemetry] could not read opt-out setting', e));
    }

    log(message: any, ...args: any[]) {
        console.log(`\x1b[32m[Telemetry]\x1b[0m`, message, ...args)
    }

    /**
     * Log a custom event to Firebase Analytics
     * https://rnfirebase.io/analytics/usage#custom-events
     */
    logEvent(name: string, params: Record<string, any> = {}) {
        if (!this.enabled) return;
        if (isDebugMode) this.log(`Tracking event: ${name}`, params);
        logEvent(this.analytics!, name, params);
    }

    /** Whether anonymous telemetry is currently on. Resolves once the stored setting has been read. */
    async isEnabled(): Promise<boolean> {
        await this.ready;
        return this.enabled;
    }

    /**
     * Turn anonymous telemetry on or off and persist the choice.
     * Disabling sends one last `DISABLED_TELEMETRY` event so we can count opt-outs, then stops
     * Firebase collection; every later `logEvent` call returns early.
     */
    async setEnabled(enabled: boolean): Promise<void> {
        await this.ready;
        if (enabled === this.enabled) return;
        if (!enabled) this.logEvent(this.CUSTOM_EVENTS.DISABLED_TELEMETRY);
        this.enabled = enabled;
        await Promise.all([
            AsyncStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled)),
            setAnalyticsCollectionEnabled(this.analytics!, enabled),
        ]);
        if (isDebugMode) this.log(`Anonymous telemetry ${enabled ? 'enabled' : 'disabled'}`);
    }
}

const telemetry = new Telemetry();
export default telemetry;