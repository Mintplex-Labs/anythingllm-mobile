import { getApp } from '@react-native-firebase/app'
import { getAnalytics, logEvent, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics'
import { getCrashlytics, log as logCrashlytics, recordError, setAttributes, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics'
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';
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
    private crashlytics: ReturnType<typeof getCrashlytics> | null = null;
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
            /** An anythingllm://pull-hf link (Hugging Face "Use this model") opened the on-device picker (payload: repo, hasFile) */
            HF_PULL_LINK_OPENED: 'hf_pull_link_opened',
            /** Text highlighted in another app was sent to the Quick Actions card (payload: mode, action) */
            QUICK_CONTEXT_USED: 'quick_context_used',
            /** The selection-toolbar entry was switched on or off in Settings > Special tools (payload: enabled) */
            QUICK_CONTEXT_TOGGLED: 'quick_context_toggled',
            /** "Set up" / "Change" in Settings > Device Assistant, which opens Android's assistant settings (payload: alreadyDefault) */
            ASSISTANT_SETUP_OPENED: 'assistant_setup_opened',
            /** The assist gesture opened the assistant overlay */
            ASSISTANT_INVOKED: 'assistant_invoked',
            /** A prompt was sent from the assistant overlay (payload: screenshot, voice, followUp) */
            ASSISTANT_CHAT_SENT: 'assistant_chat_sent',
            /** An assistant behavior was switched in Settings > Assistant (payload: preference, enabled) */
            ASSISTANT_PREFERENCE_TOGGLED: 'assistant_preference_toggled',
            /** A background theme was picked in Settings > Assistant (payload: theme) */
            ASSISTANT_THEME_CHANGED: 'assistant_theme_changed',
            TOOL_CALLED: 'tool_called',
            /** The user switched a tool on from the tools sheet (payload: tool, provider) - disabling and suggestion-chip toggles are not tracked */
            TOOL_ENABLED: 'tool_enabled',
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
            /** The user approved a reminder from chat (payload: kind alarm|timer|calendar) */
            REMINDER_SET: 'reminder_set',
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
        // Creating the Crashlytics instance installs its global JS error handler, so fatal JS
        // errors and native crashes are reported with their message and stack. Follows the same opt-out.
        this.crashlytics = getCrashlytics();
        this.ready = AsyncStorage.getItem(TELEMETRY_ENABLED_KEY)
            .then(async (value) => {
                this.enabled = value !== 'false';
                if (!this.enabled)
                    await Promise.all([
                        setAnalyticsCollectionEnabled(this.analytics!, false),
                        setCrashlyticsCollectionEnabled(this.crashlytics!, false),
                    ]);
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

    /**
     * Report an error the app recovered from (eg. caught by an error boundary) to Crashlytics as a
     * non-fatal issue. Uncaught errors are reported automatically by Crashlytics' global handler.
     * @param context - extra detail logged alongside the report, eg. the React component stack
     */
    recordError(error: Error, context?: string) {
        if (!this.enabled || !this.crashlytics) return;
        if (context) logCrashlytics(this.crashlytics, context.slice(0, 2000));
        recordError(this.crashlytics, error);
    }

    /**
     * Runs a llama.rn `initLlama` call and stamps Crashlytics custom keys around it. A SIGSEGV inside
     * llama.cpp has no JS stack, so these keys are the only record of which GGUF was loading when it died.
     * Keys are per `kind` (`llama_<kind>_*`) so a concurrent embedder load never overwrites the chat model's.
     * `llama_<kind>_state` reads "loading" on a crash that happened during the load itself.
     * @param kind - which runtime is loading, eg. "chat", "embedder", "reranker"
     * @param path - absolute path of the GGUF being loaded
     * @param details - extra context, eg. source (catalog/imported) or n_ctx
     */
    async trackNativeModelLoad<T>(
        kind: string,
        path: string,
        details: Record<string, string | number | boolean>,
        load: () => Promise<T>,
    ): Promise<T> {
        const file = path.split('/').pop() || path;
        const sizeMb = await RNFS.stat(path).then((s) => Math.round(Number(s.size) / (1024 * 1024))).catch(() => -1);
        const extra = Object.fromEntries(Object.entries(details).map(([key, value]) => [`llama_${kind}_${key}`, String(value)]));
        // Awaited so the keys reach the native SDK before the load can crash the process.
        await this.setCrashContext(`llama ${kind}: loading ${file} (${sizeMb}MB)`, {
            [`llama_${kind}_state`]: 'loading',
            [`llama_${kind}_model`]: file,
            [`llama_${kind}_size_mb`]: String(sizeMb),
            ...extra,
        });
        try {
            const result = await load();
            this.setCrashContext(`llama ${kind}: loaded ${file}`, { [`llama_${kind}_state`]: 'loaded' });
            return result;
        } catch (error) {
            this.setCrashContext(`llama ${kind}: failed to load ${file}`, { [`llama_${kind}_state`]: 'failed' });
            throw error;
        }
    }

    /** Adds a breadcrumb and custom keys to any crash report from here on. Never throws. */
    private async setCrashContext(breadcrumb: string, attributes: Record<string, string>) {
        if (!this.enabled || !this.crashlytics) return;
        try {
            logCrashlytics(this.crashlytics, breadcrumb);
            await setAttributes(this.crashlytics, attributes);
        } catch (e) {
            this.log('could not set crash context', e);
        }
    }

    /** Whether anonymous telemetry is currently on. Resolves once the stored setting has been read. */
    async isEnabled(): Promise<boolean> {
        await this.ready;
        return this.enabled;
    }

    /**
     * Turn anonymous telemetry on or off and persist the choice.
     * Disabling sends one last `DISABLED_TELEMETRY` event so we can count opt-outs, then stops
     * Firebase analytics and crash report collection; every later `logEvent` call returns early.
     */
    async setEnabled(enabled: boolean): Promise<void> {
        await this.ready;
        if (enabled === this.enabled) return;
        if (!enabled) this.logEvent(this.CUSTOM_EVENTS.DISABLED_TELEMETRY);
        this.enabled = enabled;
        await Promise.all([
            AsyncStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled)),
            setAnalyticsCollectionEnabled(this.analytics!, enabled),
            // Crash reports stay off in dev builds (firebase.json crashlytics_debug_enabled)
            setCrashlyticsCollectionEnabled(this.crashlytics!, enabled && !__DEV__),
        ]);
        if (isDebugMode) this.log(`Anonymous telemetry ${enabled ? 'enabled' : 'disabled'}`);
    }
}

const telemetry = new Telemetry();
export default telemetry;