import BackgroundWork from "@/utils/BackgroundWork";
import { type BrowserSessionSnapshot } from "@/utils/BrowserUse/agent";
import { clip } from "@/utils/BrowserUse/text";
import i18n from "@/i18n";

/** The foreground service notification for a session: what the agent is doing right now, or what it needs. */
export function sessionNotification(task: string) {
    let shown = '';
    const textFor = (snapshot: BrowserSessionSnapshot | null) => {
        if (snapshot?.status === 'needs-help' && snapshot.question)
            return { title: i18n.t('browser_use.notification.needs_help_title'), body: clip(snapshot.question, 240) };
        return {
            title: i18n.t('browser_use.notification.title'),
            body: snapshot?.step?.label || clip(task, 240),
        };
    };
    return {
        textFor,
        /** Only touches the notification when its text changes - token updates arrive far more often than steps. */
        show(snapshot: BrowserSessionSnapshot) {
            if (snapshot.endedAt) return;
            const text = textFor(snapshot);
            const key = `${text.title}\n${text.body}`;
            if (key === shown) return;
            shown = key;
            BackgroundWork.update(snapshot.sessionId, text);
        },
    };
}
