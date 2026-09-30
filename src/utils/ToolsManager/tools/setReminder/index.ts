import moment from "moment";
import { type IReminderAction } from "@/database/models/WorkspaceChat";
import { type ToolExecutionContext } from "@/utils/ToolsManager";
import ToolApproval from "@/utils/ToolsManager/toolApproval";
import { confirmAfterApproval, formatDuration, resolveReminder, saveCalendarReminder, setClockAlarm, setClockTimer } from "@/utils/reminders";
import { parseToolArgs, type StreamEmitter } from "../createFiles/shared";
import Telemetry from "@/utils/Telemetry";
import i18n from "@/i18n";

type Args = {
    label: string;
    in_minutes?: number | string;
    at_time?: string;
    on_date?: string;
};

const MAX_LABEL_LENGTH = 80;
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/** "Today at 3:00 PM", "Friday at 5:00 PM" within the week, "Tue, Oct 14, 2026 9:00 AM" past it */
function describeWhen(fireAt: number, lng?: string): string {
    const when = moment(fireAt);
    if (lng) when.locale(lng);
    return fireAt - Date.now() < SIX_DAYS_MS ? when.calendar() : when.format('llll');
}

/**
 * Sets a reminder the user asked for in chat. Nothing is set until the user approves it on the
 * tool approval card. Within a day it goes to the clock app - relative times ("in 20 minutes")
 * as a timer, clock times ("at 3pm") as an alarm - which then owns it and rings like any other.
 * Further out the clock app cannot hold it (alarms have no date, timers stop at 24 hours), so it
 * is added to the user's calendar as a short event with an alert at its start.
 *
 * The device works out the time, so the model never needs the current date. The tool refuses to
 * run unattended (scheduled jobs) - an alarm nobody approved is not one the user wants.
 */
const tool = {
    id: 'setReminder',
    get name() { return i18n.t('tools.set_reminder.name'); },
    get description() { return i18n.t('tools.set_reminder.description'); },
    defaultEnabled: true,
    category: 'appConnections' as const,
    hiddenFromScheduledJobs: true,
    definition: {
        type: 'function' as const,
        function: {
            name: 'set_reminder',
            description:
                'Set an alarm, timer or reminder for the user on their phone. ' +
                'Use in_minutes for relative times ("in 20 minutes", "in 2 hours" = 120). ' +
                'Use at_time, plus on_date when a day was named, for clock times ("at 3pm", "tomorrow at 9", "Friday at 5pm"). ' +
                'You do not need the current date or time - the phone works it out. ' +
                'Within 24 hours it is set in the clock app; later reminders are added to the calendar with an alert. ' +
                'The user approves it before it is set.',
            parameters: {
                type: 'object' as const,
                properties: {
                    label: { type: 'string', description: 'What to remind the user about, short eg: "Call mom", "Take the pizza out".' },
                    in_minutes: { type: 'number', description: 'Minutes from now, for relative times. Omit when using at_time.' },
                    at_time: { type: 'string', description: 'Clock time in 24-hour "HH:mm" in the user\'s local time eg: "15:30". Omit when using in_minutes.' },
                    on_date: {
                        type: 'string',
                        description: 'The day for at_time: "today", "tomorrow", a weekday name eg: "friday" (its next occurrence), or "YYYY-MM-DD". Omit for the next time at_time comes round.',
                    },
                },
                required: ['label'] as const,
            },
        },
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: StreamEmitter, context: ToolExecutionContext = {}): Promise<string> {
        try {
            // Never unattended - the person who approves must be looking at the screen.
            if (context.autoApproveTools) return 'Reminders cannot be set from an unattended run. Ask the user to set this up from a chat instead.';

            const parsed = parseToolArgs<Args>(args, { label: '' });
            const label = String(parsed.label ?? '').trim().slice(0, MAX_LABEL_LENGTH) || i18n.t('tools.set_reminder.default_label');
            const resolved = resolveReminder({ inMinutes: parsed.in_minutes, atTime: parsed.at_time, onDate: parsed.on_date });
            if (!resolved.ok) return `${resolved.error} No reminder was set.`;
            const { kind, durationSeconds } = resolved;

            const when = describeWhen(resolved.fireAt);
            const duration = durationSeconds ? formatDuration(durationSeconds) : '';
            streamEmitter('report_status', i18n.t('tools.set_reminder.status_asking', { label }));
            const approval = await ToolApproval.request({
                skillName: this.definition.function.name,
                description: {
                    alarm: i18n.t('tools.set_reminder.approval_alarm', { label, when }),
                    timer: i18n.t('tools.set_reminder.approval_timer', { label, duration, when }),
                    calendar: i18n.t('tools.set_reminder.approval_calendar', { label, when }),
                }[kind],
                payload: { label, when, type: kind },
                streamEmitter,
                signal: context.signal,
            });
            if (!approval.approved) {
                streamEmitter('report_status', i18n.t('tools.set_reminder.status_not_approved'));
                return `${approval.message} No reminder was set.`;
            }

            // Approval can take up to a minute - never hand the clock app a time that has gone by.
            const confirmed = confirmAfterApproval(resolved);
            if (!confirmed.ok) {
                streamEmitter('report_status', i18n.t('tools.set_reminder.status_expired'));
                return `${confirmed.error} No reminder was set - ask the user if they still want it.`;
            }
            const { fireAt } = confirmed;
            const whenForModel = describeWhen(fireAt, 'en');

            let eventId: string | null = null;
            try {
                if (kind === 'alarm') await setClockAlarm(fireAt, label);
                else if (kind === 'timer') await setClockTimer(durationSeconds!, label);
                else eventId = await saveCalendarReminder(fireAt, label);
            } catch (error: any) {
                console.error('[setReminder] could not set it', error);
                if (error?.message === 'calendar_permission_denied') return 'Calendar access was not allowed, so the reminder could not be added. It is more than a day away, which the clock app cannot hold. Tell the user to allow calendar access for AnythingLLM in their phone settings.';
                if (error?.message === 'no_writable_calendar') return 'The user has no calendar that can be written to, so the reminder could not be added. It is more than a day away, which the clock app cannot hold.';
                if (error?.code === 'clock_unavailable') return 'No clock app is installed that accepts alarms or timers, so no reminder was set.';
                return `Could not set the reminder: ${error?.message ?? 'unknown error'}.`;
            }

            const action: IReminderAction = { type: 'reminder_set', action: { kind, label, fireAt, durationSeconds, eventId } };
            streamEmitter('report_action', action);
            streamEmitter('report_status', i18n.t('tools.set_reminder.status_set', { label }));
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.REMINDER_SET, { kind });

            const set = {
                alarm: `Set an alarm "${label}" in the clock app for ${whenForModel}.`,
                timer: `Started a ${formatDuration(durationSeconds!, 'en')} timer "${label}" in the clock app. It ends ${whenForModel}.`,
                calendar: `Added "${label}" to the user's calendar for ${whenForModel} with an alert when it starts.`,
            }[kind];
            return `${set} The user sees it as a card in the chat. Confirm it briefly in one sentence.`;
        } catch (error: any) {
            console.error('[setReminder] failed', error);
            return `Could not set the reminder: ${error?.message ?? 'unknown error'}.`;
        }
    },
};

export default tool;
