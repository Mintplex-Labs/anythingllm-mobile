import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { Notification } from '@notifee/react-native';
import { useEffect } from 'react';

class PushNotifications {
    private static instance: PushNotifications;
    private channelId: string | null = null;

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
        notifee.createChannel({
            id: 'anythingllm-channel',
            name: 'AnythingLLM',
        }).then(createdChannelId => this.channelId = createdChannelId);
    }

    /**
     * Send a push notification
     * @param props - The notification properties
     * @returns The notification unique id to reference it later if needed
     */
    public async send(props: Notification): Promise<string> {
        if (!this.channelId) throw new Error('Channel not created');
        props.android = { ...props.android, channelId: this.channelId }
        return await notifee.displayNotification(props);
    }

    /**
     * Cancel a push notification
     * @param notificationId - The notification unique id to cancel
     */
    public async cancel(notificationId: string) {
        if (!this.channelId) throw new Error('Channel not created');
        if (!notificationId) throw new Error('Notification ID is required');
        await notifee.cancelNotification(notificationId);
    }
}

export default PushNotifications.getInstance();
export function useEnablePushNotifications() {
    useEffect(() => { PushNotifications.getInstance(); }, []);
}