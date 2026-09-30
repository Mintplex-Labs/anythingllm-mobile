import { NativeModules, Platform } from 'react-native';
import uiStore from '@/store/UIStore';
import { createPersistentSession, discardEmptyQuickContextThread, type FeatureWorkspace, type QuickContextSession } from '@/quickContext';

/**
 * Assistant: AnythingLLM as the device's default assistant app, in the slot Gemini holds out
 * of the box (Android, see the assistant/ package on the native side). The user picks it in Android's
 * settings; from then on the assist gesture (long-press home or the navigation handle, depending on
 * the device) opens an overlay over whatever app is on screen, under an animated color wash like
 * Circle to Search's. The overlay can attach a screenshot of that app to the prompt (vision models only)
 * and takes typed or dictated prompts, answered by the model selected in the app.
 *
 * Every invocation starts a new conversation, saved as a thread in the "Device Assistant Chats"
 * workspace (found or created on first use) so it can be picked up in the app later; a thread nothing
 * was sent in is dropped again when the overlay closes. The overlay runs in the main app's JS runtime.
 */

export const ASSISTANT_SYSTEM_PROMPT = [
    'You are AnythingLLM, a helpful assistant the user opened from their phone while using another app.',
    'Answer briefly and directly in plain language; short lists are fine where they help.',
    'When a screenshot is attached it shows the screen the user was looking at when they opened you - use it to understand what they are asking about, and refer to what is on it when relevant.',
].join(' ');

/** Where assistant conversations are saved; the slug is what Workspace.create derives from the name. */
export const ASSISTANT_WORKSPACE: FeatureWorkspace = {
    name: 'Device Assistant Chats',
    slug: 'device-assistant-chats',
    systemPrompt: ASSISTANT_SYSTEM_PROMPT,
};

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

/** The background's state - see AssistantGlowView.kt. */
export type GlowState = 'idle' | 'listening' | 'thinking' | 'hidden';

/**
 * Background themes for the overlay, drawn natively (android/.../assistant/themes - keep the ids in
 * sync with AssistantThemes.kt). The choice is stored natively so the overlay opens with it straight
 * away; an unknown value anywhere falls back to the default.
 */
export const ASSISTANT_THEMES = ['rainbow', 'halftone', 'terrain', 'painterly'] as const;
export type AssistantThemeId = (typeof ASSISTANT_THEMES)[number];
export const DEFAULT_ASSISTANT_THEME: AssistantThemeId = 'rainbow';

export function resolveAssistantTheme(value: unknown): AssistantThemeId {
    return typeof value === 'string' && (ASSISTANT_THEMES as readonly string[]).includes(value)
        ? (value as AssistantThemeId)
        : DEFAULT_ASSISTANT_THEME;
}

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

/** The themes this device can draw - the textured ones need Android 13 - in picker order. */
export async function getAvailableAssistantThemes(): Promise<AssistantThemeId[]> {
    if (!isAssistantAvailable()) return [DEFAULT_ASSISTANT_THEME];
    const ids: unknown = await AssistantModule.getAvailableThemes().catch(() => null);
    const known = Array.isArray(ids) ? ASSISTANT_THEMES.filter((id) => ids.includes(id)) : [];
    return known.length > 0 ? known : [DEFAULT_ASSISTANT_THEME];
}

export async function getAssistantTheme(): Promise<AssistantThemeId> {
    if (!isAssistantAvailable()) return DEFAULT_ASSISTANT_THEME;
    return resolveAssistantTheme(await AssistantModule.getTheme().catch(() => null));
}

/** Save the theme (applied to an open overlay too); resolves to the theme actually saved. */
export async function setAssistantTheme(theme: AssistantThemeId): Promise<AssistantThemeId> {
    if (!isAssistantAvailable()) return DEFAULT_ASSISTANT_THEME;
    return resolveAssistantTheme(await AssistantModule.setTheme(resolveAssistantTheme(theme)));
}

/** Whether the background moves (default) or is drawn as a still picture, which saves battery and heat. */
export async function getAssistantAnimated(): Promise<boolean> {
    if (!isAssistantAvailable()) return true;
    return (await AssistantModule.getAnimated().catch(() => true)) !== false;
}

export async function setAssistantAnimated(animated: boolean): Promise<boolean> {
    if (!isAssistantAvailable()) return true;
    return (await AssistantModule.setAnimated(animated)) !== false;
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

/**
 * A new thread in the Device Assistant Chats workspace for one invocation. It keeps the default thread
 * name, so the chat handler names it after the first prompt like any other thread.
 */
export function createAssistantSession(): Promise<QuickContextSession> {
    return createPersistentSession(ASSISTANT_WORKSPACE);
}

/** Drop the invocation's thread when nothing was sent in it, so empty threads never pile up. */
export function discardEmptyAssistantThread(session: QuickContextSession): Promise<void> {
    return discardEmptyQuickContextThread(session);
}
