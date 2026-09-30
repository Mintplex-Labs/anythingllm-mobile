import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Alarm, CalendarCheck, CaretRight, Timer } from "phosphor-react-native";
import moment from "moment";
import { useTranslation } from "react-i18next";
import { type IAgentAction, type IReminderAction } from "@/database/models/WorkspaceChat";
import { formatDuration, formatReminderWhen, openReminder } from "@/utils/reminders";
import { showToast } from "@/utils/Notification";

/**
 * One card per reminder the user approved in this turn (persisted as a `reminder_set` action):
 * what it is for, when it fires and where it lives. Tapping opens the clock app's alarms or
 * timers, or the event in the calendar app - where it can be changed or deleted, since we
 * cannot see what happens to it there.
 */
export default memo(function ReminderCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    // Like the other cards, wait for the reply to finish so streaming text does not keep pushing the card around.
    if (isLoading) return null;
    const reminders = actions.filter((action): action is IReminderAction => action.type === 'reminder_set');
    if (reminders.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {reminders.map((action, index) => <ReminderCard key={`${action.action.fireAt}-${index}`} action={action} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 - same surface as the other chat cards */
    card: '#27272A',
    iconChip: '#3F3F46',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    /** amber-300 */
    accent: '#FCD34D',
    /** zinc-500 - the reminder has gone off */
    spent: '#71717A',
    link: '#84CAFF',
} as const;

const ICONS = { alarm: Alarm, timer: Timer, calendar: CalendarCheck } as const;

function ReminderCard({ action }: { action: IReminderAction }) {
    const { t } = useTranslation();
    const { kind, label, fireAt, durationSeconds } = action.action;
    const Icon = ICONS[kind] ?? Alarm;
    const passed = fireAt <= Date.now();
    const kindLabel = t(`chat.reminder_card.kind_${kind}`);
    const detail = kind === 'timer' && durationSeconds
        ? t('chat.reminder_card.timer_detail', { duration: formatDuration(durationSeconds), time: moment(fireAt).format('LT') })
        : formatReminderWhen(fireAt);
    const status = passed ? t('chat.reminder_card.passed') : moment(fireAt).fromNow();

    const open = () => openReminder(action.action).catch(() => showToast(t(kind === 'calendar' ? 'chat.reminder_card.open_calendar_failed' : 'chat.reminder_card.open_clock_failed')));
    return (
        <TouchableOpacity
            onPress={open}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.reminder_card.open_label', { kind: kindLabel, label, when: detail })}
            style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, width: '100%' }}
            className="flex flex-row items-center">
            <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                <Icon size={22} color={passed ? COLORS.spent : COLORS.accent} weight={passed ? 'regular' : 'fill'} />
            </View>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <Text numberOfLines={2} style={{ color: COLORS.text }} className="text-base font-medium">{label}</Text>
                <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{`${kindLabel} · ${detail}`}</Text>
                <Text numberOfLines={1} style={{ color: passed ? COLORS.spent : COLORS.accent }} className="text-xs font-medium">{status}</Text>
            </View>
            <View className="flex flex-row items-center" style={{ gap: 2 }}>
                <Text style={{ color: COLORS.link }} className="text-sm font-medium">{t('chat.reminder_card.view')}</Text>
                <CaretRight size={14} color={COLORS.link} />
            </View>
        </TouchableOpacity>
    );
}
