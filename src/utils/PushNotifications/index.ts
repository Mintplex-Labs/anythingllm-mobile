import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { Notification } from '@notifee/react-native';
import { useEffect } from 'react';

class PushNotifications {
    private static instance: PushNotifications;
    private channelId: string | null = null;

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
        if (!AuthorizationStatus.AUTHORIZED) notifee.requestPermission();
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