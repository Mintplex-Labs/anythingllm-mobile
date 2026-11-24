import { Linking, NativeModules, Platform } from 'react-native';
import notifee, { TriggerType } from '@notifee/react-native';
import { type IReminderAction } from '@/database/models/WorkspaceChat';
import PushNotifications from '@/utils/PushNotifications';
import i18n from '@/i18n';

const { AlarmKitModule, RemindersModule } = NativeModules;

/**
 * Where reminders go on iOS. Within a day they ring as an alarm (AlarmKit), which the system owns
 * and sounds even when the app is closed. Apps cannot put alarms or timers in the Clock app, and
 * before iOS 26.1 cannot ring at all, so there they are scheduled as local notifications instead.
 * Reminders further out go to the Reminders app.
 * @see reminderDelivery.ts
 */

/** AlarmKit can ring an alarm without a Live Activity from iOS 26.1 */
const HAS_ALARMS = parseFloat(String(Platform.Version)) >= 26.1;

/** Where a reminder within a day ends up, for the model - English */
export const SHORT_REMINDER_PLACE = HAS_ALARMS ? 'as an alarm on the phone' : 'as a notification on the phone';
/** Where a reminder further out ends up, for the model - English */
export const LATER_REMINDER_PLACE = "the user's Reminders app";
/** What the card shows a reminder further out as */
export const LATER_REMINDER_KIND = 'reminder' as const;

/** Translation keys for the copy that says where reminders go */
export const REMINDER_COPY_KEYS = {
    description: HAS_ALARMS ? 'tools.set_reminder.description_alarms_ios' : 'tools.set_reminder.description_ios',
    approvalAlarm: HAS_ALARMS ? 'tools.set_reminder.approval_alarm' : 'tools.set_reminder.approval_notification_ios',
    // There is no countdown to show, so a timer is asked for as the alarm it ends with.
    approvalTimer: HAS_ALARMS ? 'tools.set_reminder.approval_alarm' : 'tools.set_reminder.approval_notification_ios',
    approvalCalendar: 'tools.set_reminder.approval_reminders_ios',
    openFailed: 'chat.reminder_card.open_reminders_failed',
} as const;

export async function setClockAlarm(fireAt: number, label: string): Promise<void> {
    await ring(fireAt, label);
}

export async function setClockTimer(seconds: number, label: string): Promise<void> {
    await ring(Date.now() + seconds * 1000, label);
}

/** Adds a reminder with an alert at `fireAt` to the Reminders app and returns its id. Rejects with code `reminders_permission_denied` or `no_reminders_list`. */
export async function saveLaterReminder(fireAt: number, label: string): Promise<string> {
    return RemindersModule.save(label, fireAt, i18n.t('tools.set_reminder.calendar_notes'));
}

/** Only reminders in the Reminders app live somewhere the card can open - alarms and notifications have no app */
export function canOpenReminder(kind: IReminderAction['action']['kind']): boolean {
    return kind === 'reminder';
}

/** Opens the Reminders app - iOS has no link to a single reminder. Throws when it could not be opened. */
export async function openReminder(_reminder: IReminderAction['action']): Promise<void> {
    await Linking.openURL('x-apple-reminderkit://');
}

/** Rejects with code `alarms_denied`, or throws `notifications_denied`, when the user has turned them off for the app */
async function ring(fireAt: number, label: string): Promise<void> {
    if (!HAS_ALARMS) return scheduleNotification(fireAt, label);
    await AlarmKitModule.schedule(fireAt, label);
}

async function scheduleNotification(fireAt: number, label: string): Promise<void> {
    if (!(await PushNotifications.requestPermission())) throw new Error('notifications_denied');
    await notifee.createTriggerNotification(
        {
            title: label,
            body: i18n.t('tools.set_reminder.notification_body'),
            ios: {
                sound: 'default',
                // Time Sensitive needs an entitlement - active still shows on the lock screen and in Focus summaries.
                interruptionLevel: 'active',
                foregroundPresentationOptions: { banner: true, list: true, sound: true },
            },
        },
        { type: TriggerType.TIMESTAMP, timestamp: fireAt },
    );
}
