import { NativeModules, Platform } from 'react-native';
import uiStore from '@/store/UIStore';
import { createEphemeralSession, type QuickContextSession } from '@/quickContext';

/**
 * Assistant: AnythingLLM as the device's default assistant app, in the slot Gemini holds out
 * of the box (Android, see the assistant/ package on the native side). The user picks it in Android's
 * settings; from then on the assist gesture (long-press home or the navigation handle, depending on
 * the device) opens an overlay over whatever app is on screen, under an animated color wash like
 * Circle to Search's. The overlay can attach a screenshot of that app to the prompt (vision models only)
 * and takes typed or dictated prompts, answered by the model selected in the app.
 *
 * Conversations are ephemeral - the same in-memory workspace and thread as Quick Actions' Edit mode -
 * and every invocation starts a new one. The overlay runs in the main app's JS runtime.
 */

export const ASSISTANT_WORKSPACE = {
    name: 'Assistant',
    slug: 'assistant',
} as const;

export const ASSISTANT_SYSTEM_PROMPT = [
    'You are AnythingLLM, a helpful assistant the user opened from their phone while using another app.',
    'Answer briefly and directly in plain language; short lists are fine where they help.',
    'When a screenshot is attached it shows the screen the user was looking at when they opened you - use it to understand what they are asking about, and refer to what is on it when relevant.',
].join(' ');

/**
 * Longest edge (px) a screenshot is scaled down to. Screenshots are about twice as tall as they are
 * wide, so these cover roughly the same pixel count - and so context window - as the square limits in
 * `IMAGE_MAX_DIMENSION`, while keeping on-screen text more legible.
 */
export const SCREENSHOT_MAX_DIMENSION = {
    onDevice: 768,
    external: 1536,
} as const;

export type AssistantPreferences = {
    /** Start dictation as soon as the overlay opens */
    autoListen: boolean;
    /** Attach the screenshot to the first prompt without the user asking */
    autoScreenshot: boolean;
};

const PREFERENCE_KEYS = {
    autoListen: 'assistant_auto_listen',
    autoScreenshot: 'assistant_auto_screenshot',
} as const;

/** Why no screenshot came with this invocation - see AssistantScreenshot.kt. */
export type ScreenshotUnavailableReason = 'disabled' | 'blocked' | 'timeout' | 'none';
export type InvocationScreenshot = { uri: string; reason?: undefined } | { uri: null; reason: ScreenshotUnavailableReason };

/** The color wash's look - see AssistantGlowView.kt. */
export type GlowState = 'idle' | 'listening' | 'thinking' | 'hidden';

const { AssistantModule } = NativeModules;

/** Whether this platform can host the assistant at all (Android only - iOS offers no such role). */
export function isAssistantAvailable(): boolean {
    return Platform.OS === 'android' && !!AssistantModule;
}

/** Whether the user has picked AnythingLLM as the device's digital assistant app. */
export async function isDefaultAssistant(): Promise<boolean> {
    if (!isAssistantAvailable()) return false;
    return AssistantModule.isDefaultAssistant();
}

/**
 * Open Android's digital assistant settings, where the user picks the default assistant (apps cannot
 * ask for the role with a dialog) and allows screenshots. Resolves false if no settings page opened.
 */
export async function openAssistantSettings(): Promise<boolean> {
    if (!isAssistantAvailable()) return false;
    return AssistantModule.openAssistantSettings();
}

export async function getAssistantPreferences(): Promise<AssistantPreferences> {
    const [autoListen, autoScreenshot] = await Promise.all([
        uiStore.getFromStorage<boolean>(PREFERENCE_KEYS.autoListen, false),
        uiStore.getFromStorage<boolean>(PREFERENCE_KEYS.autoScreenshot, false),
    ]);
    return { autoListen: !!autoListen, autoScreenshot: !!autoScreenshot };
}

export async function setAssistantPreference(preference: keyof AssistantPreferences, enabled: boolean): Promise<void> {
    await uiStore.setToStorage(PREFERENCE_KEYS[preference], enabled);
}

/** The screenshot the system took of the app under the overlay; waits for it if it is still on its way. */
export async function getInvocationScreenshot(): Promise<InvocationScreenshot> {
    if (!isAssistantAvailable()) return { uri: null, reason: 'none' };
    return AssistantModule.getScreenshot();
}

export function setGlowState(state: GlowState): void {
    AssistantModule?.setGlowState(state);
}

/** Close the overlay and return to the app underneath. */
export function closeAssistant(): void {
    AssistantModule?.finish();
}

/** Bring the main app forward (eg: to finish onboarding) and close the overlay. */
export function openMainAppFromAssistant(): void {
    AssistantModule?.openInApp();
}

/** A fresh in-memory conversation for one invocation - nothing is stored. */
export function createAssistantSession(): QuickContextSession {
    return createEphemeralSession({
        name: ASSISTANT_WORKSPACE.name,
        slug: ASSISTANT_WORKSPACE.slug,
        systemPrompt: ASSISTANT_SYSTEM_PROMPT,
        threadSlugPrefix: 'assistant',
    });
}
