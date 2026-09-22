import { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Workspace from '@/database/models/Workspace';
import WorkspaceThread from '@/database/models/WorkspaceThread';
import uiStore from '@/store/UIStore';
import { PATHS } from '@/utils/paths';
import { resetToWhenReady } from '@/utils/navigationRef';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import type { ChatRouteParams } from '@/utils/defaultChatRoute';

/**
 * Content other apps share to AnythingLLM through the system share sheet.
 *
 * The native `SharedContentModule` (Android: ACTION_SEND intents, iOS: document types + openURL)
 * copies every shared file into the app's cache and describes it as a `SharedItem`. This module:
 *  1. receives those items (launch intent or live event),
 *  2. picks the chat to open - a fresh thread in the first local workspace, creating one if needed,
 *  3. stashes the items for that chat screen and navigates to it.
 * `useAttachments` on the chat screen then consumes the stash (`consumePendingShare`) and attaches the
 * files exactly as if the user had picked them from the "+" sheet.
 */

/** A shared file the native side copied into the app cache. `kind` is derived from the mime type. */
export type SharedFileItem = {
    kind: 'file' | 'image';
    /** file:// URL of our own copy of the shared content */
    uri: string;
    name: string;
    mimeType: string;
    size: number;
};
/**
 * Plain text shared without a file (Android only - iOS has no document type for text selections).
 * Any http(s) links in it are attached as documents via the web scraper; text without a link is declined.
 */
export type SharedTextItem = { kind: 'text'; text: string };
/** A link pulled out of shared text - read with the web scraper and attached as a document. */
export type SharedUrlItem = { kind: 'url'; url: string };
export type SharedItem = SharedFileItem | SharedTextItem;
/** What the chat screen attaches: copied files/images and links to read. */
export type SharedAttachable = SharedFileItem | SharedUrlItem;

export type PreparedImage = { base64: string; mime: string; width: number; height: number };

/** Items waiting for a chat screen to attach them, and the thread they belong to. */
export type PendingShare = ChatRouteParams & { items: SharedAttachable[] };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

/** Every distinct http(s) link in a piece of shared text, trailing punctuation stripped. */
export function extractUrls(text: string): string[] {
    const found = (text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''));
    return [...new Set(found)];
}

const { SharedContentModule } = NativeModules;
const SHARED_CONTENT_EVENT = 'SharedContentReceived';
/** uiStore event fired once shared files were stashed for a chat screen - payload is the `PendingShare` */
export const SHARED_CONTENT_READY = 'SHARED_CONTENT_READY';
const PENDING_SHARE_KEY = '@pendingSharedContent';
const nativeEmitter = SharedContentModule ? new NativeEventEmitter(SharedContentModule) : null;

function log(message: string, ...args: any[]) {
    console.log(`\x1b[35m[SharedContent]\x1b[0m ${message}`, ...args);
}

export function isSharedContentSupported(): boolean {
    return !!SharedContentModule;
}

/** The content the app was launched with, if any. Only ever returns a given share once. */
export async function getInitialShare(): Promise<SharedItem[] | null> {
    if (!SharedContentModule) return null;
    const items = await SharedContentModule.getInitialShare();
    return Array.isArray(items) && items.length ? (items as SharedItem[]) : null;
}

/** Content shared while the app is already running. */
export function addSharedContentListener(callback: (items: SharedItem[]) => void): { remove: () => void } {
    if (!nativeEmitter) return { remove: () => {} };
    const subscription = nativeEmitter.addListener(SHARED_CONTENT_EVENT, (items: unknown) => {
        if (Array.isArray(items) && items.length) callback(items as SharedItem[]);
    });
    return { remove: () => subscription.remove() };
}

/**
 * Downscale a shared image to `maxDimension` px on its longest edge and return it as a base64 JPEG -
 * the same shape the image picker hands `useAttachments` for gallery photos.
 */
export async function prepareSharedImage(uri: string, { maxDimension, quality }: { maxDimension: number; quality: number }): Promise<PreparedImage> {
    if (!SharedContentModule) throw new Error('Shared content is not supported on this platform');
    return await SharedContentModule.prepareImage(uri, Math.round(maxDimension), quality);
}

/** Plain filesystem path of a shared item, as RNFS and the parsers expect it. */
export function sharedItemPath(item: SharedFileItem): string {
    return decodeURI(item.uri.replace(/^file:\/\//, ''));
}

/**
 * Remove our copy of a shared file. The native side puts every share in its own `shared/<uuid>/`
 * folder, so the folder goes too. Never throws - the cleanup sweep catches leftovers.
 */
export async function removeSharedFile(item: SharedFileItem): Promise<void> {
    try {
        const path = sharedItemPath(item);
        const folder = path.slice(0, path.lastIndexOf('/'));
        const target = /\/shared\/[^/]+$/.test(folder) ? folder : path;
        if (await RNFS.exists(target)) await RNFS.unlink(target);
    } catch (e) {
        log('could not remove shared file', e);
    }
}

/** Hold shared files for the chat screen at `share.wsSlug/threadSlug` and tell any mounted screen to look. */
export function stashPendingShare(share: PendingShare): void {
    uiStore.session.set(PENDING_SHARE_KEY, share);
    uiStore.emitter.emit(SHARED_CONTENT_READY, share);
}

/**
 * Take the stashed share if it belongs to this chat screen. Only the screen showing the target thread
 * may consume it - a screen that is about to be replaced by the navigation must leave it alone, or the
 * attachments would be processed by a component that unmounts mid-way.
 */
export function consumePendingShare(wsSlug: string | null, threadSlug: string | null): PendingShare | null {
    const pending = uiStore.session.get(PENDING_SHARE_KEY) as PendingShare | undefined;
    if (!pending) return null;
    if (pending.wsSlug !== wsSlug || pending.threadSlug !== threadSlug) return null;
    uiStore.session.delete(PENDING_SHARE_KEY);
    return pending;
}

/**
 * Where shared content should go: a new thread in the first local workspace. Remote workspaces are
 * skipped since attachments cannot be sent to a remote instance. When there is no local workspace one
 * is created (which comes with a fresh thread).
 */
export async function resolveShareTarget(): Promise<ChatRouteParams> {
    const workspaces = await Workspace.find([], false);
    const local = workspaces.find((workspace) => !workspace.isRemote);

    if (!local) {
        const workspace = await Workspace.create({ name: 'My Workspace' });
        uiStore.emitter.emit('workspaceUpdate', {
            type: 'add-workspace',
            details: { name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt, threads: workspace.threads },
        });
        return { wsSlug: workspace.slug, threadSlug: workspace.threads[0].slug };
    }

    const thread = await WorkspaceThread.create({ workspaceSlug: local.slug });
    uiStore.emitter.emit('workspaceUpdate', { type: 'add-thread', details: { workspaceSlug: local.slug, thread } });
    return { wsSlug: local.slug, threadSlug: thread.slug };
}

/**
 * Route freshly shared items to a chat. Shared text is reduced to the links it contains (each is
 * read by the web scraper and attached as a document); text without a link is declined with a toast
 * since we cannot reliably put text into the uncontrolled prompt input yet. Shares that arrive before
 * onboarding finished are dropped, since there is no model to send them to.
 */
export async function handleSharedItems(items: SharedItem[]): Promise<void> {
    const files = items.filter((item): item is SharedFileItem => item.kind !== 'text' && !!item.uri);
    const urls: SharedUrlItem[] = items
        .filter((item): item is SharedTextItem => item.kind === 'text')
        .flatMap((item) => extractUrls(item.text))
        .map((url) => ({ kind: 'url', url }));
    const attachable: SharedAttachable[] = [...files, ...urls];
    if (!attachable.length) {
        showToast('Only files, images and links can be shared to AnythingLLM', 'long');
        return;
    }

    const onboarded = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
    if (!onboarded) {
        await Promise.all(files.map(removeSharedFile));
        showToast('Finish setting up AnythingLLM before sharing to it', 'long');
        return;
    }

    const target = await resolveShareTarget();
    log('Opening shared content in a new thread', target, attachable.map((item) => item.kind === 'url' ? item.url : item.name));
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.CONTENT_SHARED, {
        files: files.filter((file) => file.kind === 'file').length,
        images: files.filter((file) => file.kind === 'image').length,
        urls: urls.length,
    });
    stashPendingShare({ ...target, items: attachable });
    // Same reset the sidebar uses to switch threads so the chat screen mounts fresh for the new thread.
    resetToWhenReady(PATHS.workspace_chat, target);
}

/**
 * Listens for content shared to the app for the lifetime of the root component. Handles both a cold
 * start from the share sheet (`getInitialShare`) and shares that arrive while the app is running.
 * Shares are handled one at a time in arrival order.
 */
export function useSharedContentNavigation() {
    useEffect(() => {
        if (!SharedContentModule) return;
        let queue: Promise<void> = Promise.resolve();
        const enqueue = (items: SharedItem[]) => {
            queue = queue
                .then(() => handleSharedItems(items))
                .catch((e) => {
                    log('failed to handle shared content', e);
                    showToast('Could not open the shared content');
                });
        };

        const subscription = addSharedContentListener(enqueue);
        getInitialShare()
            .then((items) => { if (items) enqueue(items); })
            .catch((e) => log('failed to read launch share', e));
        return () => subscription.remove();
    }, []);
}
