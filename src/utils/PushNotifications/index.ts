import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { Notification } from '@notifee/react-native';
import { useEffect } from 'react';

class PushNotifications {
    private static instance: PushNotifications;
    private channels = { primary: '', progress: '' };

    /**
     * Whether the user has granted permissions to receive notifications
     */
    public notificationsEnabled: boolean = false;

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

    private initialize() {
        // Check if notifications are enabled, set initial state of notificationsEnabled
        // then on requestPermission, update the state with the new settings (if the user has not already granted permissions)
        notifee.getNotificationSettings().then(settings => {
            this.notificationsEnabled = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
            if (this.notificationsEnabled) return;

            // If the user has not yet granted permissions, request them. Otherwise, honor their denial/provisional status
            if (settings.authorizationStatus === AuthorizationStatus.NOT_DETERMINED) {
                notifee.requestPermission().then(settings => {
                    this.notificationsEnabled = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
                });
            }
        });

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
}

export default PushNotifications.getInstance();
export function useEnablePushNotifications() {
    useEffect(() => { PushNotifications.getInstance(); }, []);
}