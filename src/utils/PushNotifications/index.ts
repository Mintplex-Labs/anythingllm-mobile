import notifee, { AndroidImportance, AuthorizationStatus, EventType } from '@notifee/react-native';
import { Notification, NotificationSettings } from '@notifee/react-native';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isScreenLocked } from '@/utils/screenLock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AwaitableAlert from '@/components/AwaitableAlert';
import { navigateWhenReady } from '@/utils/navigationRef';
import { PATHS } from '@/utils/paths';

/** Longest reply preview we put in the "reply ready" notification body. */
const CHAT_PREVIEW_MAX_CHARS = 140;
/** Set once we have shown the "notifications are blocked" nudge so the user is never nagged twice. */
const BLOCKED_NUDGE_SHOWN_KEY = '@pushNotifications:blockedNudgeShown';

/** Where a notification should take the user when tapped. Carried in the notification `data`. */
export type ChatNotificationRoute = { wsSlug: string; threadSlug: string };

class PushNotifications {
    private static instance: PushNotifications;
    private channels = { primary: '', progress: '', chat: '' };

    /**
     * Whether the user has granted permissions to receive notifications
     */
    public notificationsEnabled: boolean = false;

    /**
     * Whether the user has been asked for notification permission yet. `false` until the
     * initial settings lookup resolves, so callers that want to prompt should check
     * `permissionUndecided` instead of racing this flag.
     */
    public permissionUndecided: boolean = false;

    static getInstance() {
        if (!PushNotifications.instance) PushNotifications.instance = new PushNotifications();
        return PushNotifications.instance;
    }

    constructor() {
        if (PushNotifications.instance) return PushNotifications.instance;
        PushNotifications.instance = this;
        this.initialize();
        return PushNotifications.instance;
    }

    private log(message: string, ...args: any[]) {
        console.log(`\x1b[36m[PushNotifications]\x1b[0m ${message}`, ...args);
    }

    private applySettings(settings: NotificationSettings) {
        this.notificationsEnabled = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
        this.permissionUndecided = settings.authorizationStatus === AuthorizationStatus.NOT_DETERMINED;
    }

    private initialize() {
        // Check if notifications are enabled, set initial state of notificationsEnabled
        // then on requestPermission, update the state with the new settings (if the user has not already granted permissions)
        notifee.getNotificationSettings().then(settings => {
            this.applySettings(settings);
            if (this.notificationsEnabled) return;

            // If the user has not yet granted permissions, request them. Otherwise, honor their denial/provisional status
            if (settings.authorizationStatus === AuthorizationStatus.NOT_DETERMINED) this.requestPermission();
        });

        // A user who enables notifications from system settings comes back to the app with new state.
        AppState.addEventListener('change', state => { if (state === 'active') this.refreshSettings(); });

        // Primary notification channel
        notifee.createChannel({
            id: 'anythingllm-channel',
            name: 'AnythingLLM',
        }).then(createdChannelId => this.channels.primary = createdChannelId);

        // Progress channel to prevent vibration/sounds
        notifee.createChannel({
            id: 'anythingllm-progress',
            name: 'Download Progress',
            vibration: false,
            importance: 3,
            vibrationPattern: [],
        }).then(createdChannelId => this.channels.progress = createdChannelId);

        // Chat replies finishing while the app is in the background. High importance so it
        // heads-up on the lock screen, with a single short buzz rather than the default pattern.
        // Android channel settings are immutable once created, so changes here need a new channel id.
        notifee.createChannel({
            id: 'anythingllm-chat-replies',
            name: 'Chat Replies',
            description: 'Alerts when a reply finishes while AnythingLLM is in the background',
            importance: AndroidImportance.HIGH,
            vibration: true,
            vibrationPattern: [50, 250],
            sound: 'default',
        }).then(createdChannelId => this.channels.chat = createdChannelId);
    }

    /**
     * Ask the OS for notification permission and refresh the local state from the result.
     * On iOS and Android 13+ this shows the system dialog once - after a denial the OS
     * resolves immediately without prompting, so it is safe to call repeatedly.
     * @returns Whether notifications are enabled after the request
     */
    public async requestPermission(): Promise<boolean> {
        try {
            const settings = await notifee.requestPermission();
            this.applySettings(settings);
        } catch (error) {
            this.log('Failed to request notification permission', error);
        }
        return this.notificationsEnabled;
    }

    /**
     * Ask the user to turn notifications on at the moment they first need them (sending a chat).
     *
     *  - Never asked: shows the OS permission dialog.
     *  - Blocked/denied: the OS will not show its dialog again, so once (and only once) we explain
     *    why we want notifications and offer to open the app's notification settings.
     *  - Already granted: nothing to do.
     * @returns Whether notifications are enabled afterwards
     */
    public async promptToEnableForChat(): Promise<boolean> {
        if (this.notificationsEnabled) return true;
        if (this.permissionUndecided) return await this.requestPermission();

        try {
            if (await AsyncStorage.getItem(BLOCKED_NUDGE_SHOWN_KEY)) return false;
            await AsyncStorage.setItem(BLOCKED_NUDGE_SHOWN_KEY, '1');
            const openSettings = await AwaitableAlert(
                'Get notified when replies finish',
                'Notifications are turned off for AnythingLLM. Turn them on to get a buzz when a reply finishes while your phone is locked.',
                { text: 'Not now', style: 'cancel' },
                { text: 'Open settings', style: 'default' },
            );
            if (openSettings) await notifee.openNotificationSettings();
        } catch (error) {
            this.log('Failed to show notifications-blocked nudge', error);
        }
        return this.notificationsEnabled;
    }

    /**
     * Re-read the OS permission state. Call when the app returns to the foreground so a user who
     * just enabled notifications in system settings is picked up without a restart.
     */
    public async refreshSettings() {
        try {
            this.applySettings(await notifee.getNotificationSettings());
        } catch (error) {
            this.log('Failed to refresh notification settings', error);
        }
    }

    /**
     * Prompt for permission only if the user has never answered. Used at the moment a
     * feature needs notifications (eg: first chat sent) so the ask has context.
     * @returns Whether notifications are enabled afterwards
     */
    public async requestPermissionIfUndecided(): Promise<boolean> {
        if (!this.permissionUndecided) return this.notificationsEnabled;
        return await this.requestPermission();
    }

    /**
     * Send a push notification
     * @param props - The notification properties
     * @returns The notification unique id to reference it later if needed
     */
    public async send(channel: keyof typeof this.channels, props: Notification): Promise<string> {
        if (!this.channels[channel]) throw new Error('Notification channel does not exist or has not been created');
        this.log(`Notification sent to channel ${channel}`);

        // Add the channel id to the notification
        props.android = { ...props.android, channelId: this.channels[channel] }
        return await notifee.displayNotification(props);
    }

    /**
     * Cancel a push notification
     * @param notificationId - The notification unique id to cancel
     */
    public async cancel(channel: keyof typeof this.channels, notificationId: string) {
        if (!this.channels[channel]) throw new Error('Notification channel does not exist or has not been created');
        if (!notificationId) throw new Error('Notification ID is required');
        this.log(`Notification cancelled: ${notificationId}`);
        await notifee.cancelNotification(notificationId);
    }

    /**
     * Tell the user a chat reply finished while their phone was locked.
     * Does nothing when the phone is unlocked - the reply is on screen, or the user is simply in
     * another app - or when notifications are not enabled. Never throws; a missed notification
     * must not fail the chat.
     * @param workspaceName - Shown as the subtitle so the user knows which conversation finished
     * @param preview - The reply text (or error message); trimmed to a single-line preview
     * @param failed - Whether the reply ended in an error
     * @param route - The workspace/thread to open when the notification is tapped
     */
    public async notifyChatComplete({ workspaceName, preview, failed = false, route }: {
        workspaceName?: string;
        preview: string;
        failed?: boolean;
        route?: ChatNotificationRoute;
    }) {
        if (!this.notificationsEnabled) return;
        if (!(await isScreenLocked())) return;

        const body = failed
            ? 'Your reply could not be completed. Tap to see what happened.'
            : truncatePreview(preview) || 'Your reply is ready.';

        try {
            await this.send('chat', {
                title: failed ? 'Reply failed' : 'Reply ready',
                subtitle: workspaceName || undefined,
                body,
                data: route ? { wsSlug: route.wsSlug, threadSlug: route.threadSlug } : undefined,
                android: {
                    pressAction: { id: 'default' }, // tapping brings the app back to the foreground
                },
                ios: {
                    sound: 'default', // iOS vibrates with the sound per the user's system settings
                },
            });
        } catch (error) {
            this.log('Failed to send chat complete notification', error);
        }
    }
}

/** Collapse whitespace and clip a reply to a one-line preview for the notification body. */
function truncatePreview(text: string): string {
    const flat = (text || '').replace(/\s+/g, ' ').trim();
    if (flat.length <= CHAT_PREVIEW_MAX_CHARS) return flat;
    return `${flat.slice(0, CHAT_PREVIEW_MAX_CHARS - 1).trimEnd()}…`;
}

/** Reads the chat route off a tapped notification, if it carries one. */
function routeFromNotification(notification?: Notification | null): ChatNotificationRoute | null {
    const data = notification?.data as Partial<Record<keyof ChatNotificationRoute, unknown>> | undefined;
    if (typeof data?.wsSlug !== 'string' || typeof data?.threadSlug !== 'string') return null;
    return { wsSlug: data.wsSlug, threadSlug: data.threadSlug };
}

export default PushNotifications.getInstance();
export function useEnablePushNotifications() {
    useEffect(() => { PushNotifications.getInstance(); }, []);
}

/**
 * Opens the workspace thread a chat notification points at when the user taps it.
 * Handles both a running/backgrounded app (foreground PRESS event) and a cold start from the
 * notification (`getInitialNotification`). Navigation is deferred until the navigator is ready.
 */
export function useNotificationTapNavigation() {
    useEffect(() => {
        const openRoute = (notification?: Notification | null) => {
            const route = routeFromNotification(notification);
            if (route) navigateWhenReady(PATHS.workspace_chat, route);
        };

        notifee.getInitialNotification()
            .then(initial => openRoute(initial?.notification))
            .catch(error => console.log('[PushNotifications] Failed to read initial notification', error));

        return notifee.onForegroundEvent(({ type, detail }) => {
            if (type === EventType.PRESS) openRoute(detail.notification);
        });
    }, []);
}
