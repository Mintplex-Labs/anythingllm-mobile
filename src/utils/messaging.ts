import { NativeModules, Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type IAgentAction, type ITextDraftAction } from '@/database/models/WorkspaceChat';

const { MessagingModule } = NativeModules;

export type MessagingApp = {
  packageName: string;
  label: string;
  /** PNG data URI, null if the icon could not be read */
  icon: string | null;
};

export type TextDraft = ITextDraftAction['action'];

const PREFERRED_APP_KEY = 'messaging_preferred_app';

let appsCache: Promise<MessagingApp[]> | null = null;

/**
 * Installed apps a draft can be opened in, default SMS app first. Empty off Android or if the
 * module is missing. Cached for the session since every draft card asks - pass `refresh` when
 * the user is about to pick, so newly installed or removed apps show up.
 */
export function getMessagingApps({ refresh = false }: { refresh?: boolean } = {}): Promise<MessagingApp[]> {
  if (Platform.OS !== 'android' || !MessagingModule?.getMessagingApps) return Promise.resolve([]);
  if (!appsCache || refresh) {
    appsCache = MessagingModule.getMessagingApps().catch((error: unknown) => {
      console.error('[messaging] listing apps failed', error);
      appsCache = null;
      return [];
    });
  }
  return appsCache as Promise<MessagingApp[]>;
}

export async function getPreferredApp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFERRED_APP_KEY);
  } catch {
    return null;
  }
}

const preferredAppListeners = new Set<(packageName: string) => void>();

/** Every draft card on screen shows the last used app's icon, so they all need to hear about a change */
export function onPreferredAppChanged(listener: (packageName: string) => void): () => void {
  preferredAppListeners.add(listener);
  return () => { preferredAppListeners.delete(listener); };
}

export async function setPreferredApp(packageName: string): Promise<void> {
  preferredAppListeners.forEach(listener => listener(packageName));
  try {
    await AsyncStorage.setItem(PREFERRED_APP_KEY, packageName);
  } catch (error) {
    console.error('[messaging] saving preferred app failed', error);
  }
}

/** Opens the draft in a specific app. Throws if the app is gone or refuses the intent. */
export async function openDraftInApp(packageName: string, draft: TextDraft): Promise<void> {
  await MessagingModule.openDraft(packageName, draft.phoneNumber, draft.body);
}

/**
 * System share sheet with just the body - for apps we do not list, and the only path on iOS.
 * Goes through RN's Share, which launches the chooser from the current activity.
 */
export async function shareDraft(draft: TextDraft, title?: string): Promise<void> {
  await Share.share({ message: draft.body }, { dialogTitle: title });
}

/** Something that looks like a dialable number rather than a name */
export function looksLikePhoneNumber(value: string): boolean {
  return /^\+?[\d\s().-]+$/.test(value.trim()) && (value.match(/\d/g)?.length ?? 0) >= 5;
}

/**
 * Pulls the draft out of a chat action. Old rows stored an `sms:<recipient>?body=<body>` link;
 * those are parsed back so they render as the same card.
 */
export function normalizeTextDraft(action: IAgentAction): TextDraft | null {
  if (action.type === 'text_draft') return action.action;
  if (action.type !== 'sms') return null;
  const match = /^sms:([^?]*)\?body=(.*)$/s.exec(action.action.link ?? '');
  if (!match) return null;
  let recipient = '';
  let body = '';
  try {
    recipient = decodeURIComponent(match[1]).trim();
    body = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!body) return null;
  const isNumber = looksLikePhoneNumber(recipient);
  return {
    recipientName: recipient && !isNumber ? recipient : null,
    phoneNumber: isNumber ? recipient : null,
    body,
  };
}
