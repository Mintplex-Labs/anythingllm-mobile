import { Linking, NativeModules, Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type IAgentAction, type IEmailDraftAction, type ITextDraftAction } from '@/database/models/WorkspaceChat';

const { MessagingModule } = NativeModules;

export type MessagingApp = {
  packageName: string;
  label: string;
  /** PNG data URI, null if the icon could not be read */
  icon: string | null;
};

export type TextDraft = ITextDraftAction['action'];
export type EmailDraft = IEmailDraftAction['action'];

/** Which kind of app a draft opens in - texts go to messaging apps, emails to mail apps, events to calendar apps */
export type DraftKind = 'text' | 'email' | 'calendar';

/** The text key predates email drafts - kept so the saved choice survives the update */
const PREFERRED_APP_KEYS: Record<DraftKind, string> = {
  text: 'messaging_preferred_app',
  email: 'email_preferred_app',
  calendar: 'calendar_preferred_app',
};

const NATIVE_LISTERS: Record<DraftKind, string> = {
  text: 'getMessagingApps',
  email: 'getEmailApps',
  calendar: 'getCalendarApps',
};

const appsCache: Partial<Record<DraftKind, Promise<MessagingApp[]>>> = {};

/**
 * Installed apps a draft of this kind can be opened in, in display order (default SMS app first
 * for texts, alphabetical for email and calendar). Empty off Android or if the module is missing. Cached for
 * the session since every draft card asks - pass `refresh` when the user is about to pick, so
 * newly installed or removed apps show up.
 */
export function getDraftApps(kind: DraftKind, { refresh = false }: { refresh?: boolean } = {}): Promise<MessagingApp[]> {
  const lister = NATIVE_LISTERS[kind];
  if (Platform.OS !== 'android' || !MessagingModule?.[lister]) return Promise.resolve([]);
  if (!appsCache[kind] || refresh) {
    appsCache[kind] = MessagingModule[lister]().catch((error: unknown) => {
      console.error(`[messaging] listing ${kind} apps failed`, error);
      delete appsCache[kind];
      return [];
    });
  }
  return appsCache[kind] as Promise<MessagingApp[]>;
}

export async function getPreferredApp(kind: DraftKind): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFERRED_APP_KEYS[kind]);
  } catch {
    return null;
  }
}

type PreferredAppListener = (kind: DraftKind, packageName: string) => void;
const preferredAppListeners = new Set<PreferredAppListener>();

/** Every draft card on screen shows the last used app's icon, so they all need to hear about a change */
export function onPreferredAppChanged(listener: PreferredAppListener): () => void {
  preferredAppListeners.add(listener);
  return () => { preferredAppListeners.delete(listener); };
}

export async function setPreferredApp(kind: DraftKind, packageName: string): Promise<void> {
  preferredAppListeners.forEach(listener => listener(kind, packageName));
  try {
    await AsyncStorage.setItem(PREFERRED_APP_KEYS[kind], packageName);
  } catch (error) {
    console.error('[messaging] saving preferred app failed', error);
  }
}

/** Opens the text draft in a specific app. Throws if the app is gone or refuses the intent. */
export async function openDraftInApp(packageName: string, draft: TextDraft): Promise<void> {
  await MessagingModule.openDraft(packageName, draft.phoneNumber, draft.body);
}

/** Opens the email draft in a specific mail app's compose screen. Throws if the app is gone or refuses it. */
export async function openEmailInApp(packageName: string, draft: EmailDraft): Promise<void> {
  await MessagingModule.openEmailDraft(packageName, draft.to, draft.cc, draft.subject, draft.body);
}

/**
 * System share sheet with just the body - for apps we do not list, and the only path on iOS.
 * Goes through RN's Share, which launches the chooser from the current activity.
 */
export async function shareDraft(draft: TextDraft, title?: string): Promise<void> {
  await Share.share({ message: draft.body }, { dialogTitle: title });
}

/** Share sheet for an email - Android passes `title` as the subject, so apps like Slack or Notes get both */
export async function shareEmailDraft(draft: EmailDraft, dialogTitle?: string): Promise<void> {
  await Share.share({ title: draft.subject, message: draft.body }, { dialogTitle, subject: draft.subject });
}

/** `mailto:` link for the draft - the path off Android, where the system opens the default mail app */
export function emailDraftLink(draft: EmailDraft): string {
  const params = [
    draft.cc.length ? `cc=${encodeURIComponent(draft.cc.join(','))}` : null,
    `subject=${encodeURIComponent(draft.subject)}`,
    `body=${encodeURIComponent(draft.body)}`,
  ].filter(Boolean);
  return `mailto:${draft.to.map(encodeURIComponent).join(',')}?${params.join('&')}`;
}

export async function openEmailLink(draft: EmailDraft): Promise<void> {
  await Linking.openURL(emailDraftLink(draft));
}

/** Something that looks like a dialable number rather than a name */
export function looksLikePhoneNumber(value: string): boolean {
  return /^\+?[\d\s().-]+$/.test(value.trim()) && (value.match(/\d/g)?.length ?? 0) >= 5;
}

export function looksLikeEmailAddress(value: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value.trim());
}

/**
 * Splits whatever the model sent - an array, or one string of addresses separated by commas,
 * semicolons or spaces, possibly as `Name <addr>` - into clean addresses. Drops anything that
 * is not an address.
 */
export function parseEmailAddresses(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[,;\s]+/) : [];
  const addresses = parts
    .map(part => (/<([^>]+)>/.exec(part)?.[1] ?? part).trim())
    .filter(looksLikeEmailAddress);
  return [...new Set(addresses)];
}

/**
 * Pulls the text draft out of a chat action. Old rows stored an `sms:<recipient>?body=<body>` link;
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

/**
 * Pulls the email draft out of a chat action. Old rows stored a `mailto:<to>?subject=..&body=..`
 * link; those are parsed back so they render as the same card.
 */
export function normalizeEmailDraft(action: IAgentAction): EmailDraft | null {
  if (action.type === 'email_draft') return action.action;
  if (action.type !== 'email') return null;
  const match = /^mailto:([^?]*)\?(.*)$/s.exec(action.action.link ?? '');
  if (!match) return null;
  try {
    const params: Record<string, string> = {};
    for (const pair of match[2].split('&')) {
      const [key, ...rest] = pair.split('=');
      params[key.toLowerCase()] = decodeURIComponent(rest.join('='));
    }
    if (!params.body && !params.subject) return null;
    return {
      recipientName: null,
      to: parseEmailAddresses(decodeURIComponent(match[1])),
      cc: parseEmailAddresses(params.cc ?? ''),
      subject: params.subject ?? '',
      body: params.body ?? '',
    };
  } catch {
    return null;
  }
}
