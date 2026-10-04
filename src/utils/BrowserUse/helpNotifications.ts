import { AppState } from 'react-native';

type PushNotificationsModule = typeof import('@/utils/PushNotifications');

/**
 * "The browser agent needs your help" notifications. In the app the chat card shows the question,
 * so a notification is only posted while the app is in the background (the phone locked, another
 * app in front) and cleared as soon as the user is back or the question is answered.
 *
 * PushNotifications is imported lazily: it pulls in the database and navigation, which the tool
 * chain must not.
 */
export default class HelpNotifications {
    /** Sessions with a notification showing */
    private shown = new Set<string>();

    /**
     * `waiting` lists the sessions with an open question - reminded when the app goes to the
     * background. `load` brings in PushNotifications (replaceable in tests).
     */
    constructor(
        waiting: () => Array<{ sessionId: string; question: string }>,
        private load: () => Promise<PushNotificationsModule> = () => import('@/utils/PushNotifications'),
    ) {
        AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                for (const sessionId of [...this.shown]) this.clear(sessionId);
                return;
            }
            // Locked or switched away with a question still open - remind them before the app is frozen.
            if (state !== 'background') return;
            for (const { sessionId, question } of waiting()) if (!this.shown.has(sessionId)) this.notify(sessionId, question);
        });
    }

    /** The agent just asked - only notifies when the user is not looking at the app. */
    asked(sessionId: string, question: string) {
        if (AppState.currentState !== 'active') this.notify(sessionId, question);
    }

    clear(sessionId: string) {
        if (!this.shown.delete(sessionId)) return;
        this.load()
            .then(({ default: notifications }) => notifications.clearBrowserNeedsHelp(sessionId))
            .catch(() => { });
    }

    private notify(sessionId: string, question: string) {
        this.shown.add(sessionId);
        this.load()
            .then(({ default: notifications }) => notifications.notifyBrowserNeedsHelp(sessionId, question))
            .catch(() => { });
    }
}
