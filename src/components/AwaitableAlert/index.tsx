import { Alert } from "react-native";

export interface AwaitableAlertButton {
    text?: string;
    style?: 'cancel' | 'default' | 'destructive';
    onPress?: () => void;
}

export interface AwaitableAlertOptions {
    title: string;
    message: string;
    rejectButton: AwaitableAlertButton;
    resolveButton: AwaitableAlertButton;
}

/**
 * AwaitableAlert is a wrapper around the Alert component that allows for a promise to be returned
 * @param title - The title of the alert
 * @param message - The message of the alert
 * @param rejectButton - The button to reject the alert
 * @param resolveButton - The button to resolve the alert
 * @returns A promise that resolves to the value of the resolve button
 */
export default async function AwaitableAlert(
    title: string,
    message: string,
    rejectButton: AwaitableAlertButton,
    resolveButton: AwaitableAlertButton
) {
    return await new Promise<any>((resolve) => {
        const rejectionButton: AwaitableAlertButton = { text: 'Cancel', style: 'cancel', onPress: () => { resolve(false) }, ...rejectButton }
        const resolutionButton: AwaitableAlertButton = { text: 'Continue', style: 'default', onPress: () => { resolve(true) }, ...resolveButton }
        return Alert.alert(
            title,
            message,
            [rejectionButton, resolutionButton]
        )
    })
}