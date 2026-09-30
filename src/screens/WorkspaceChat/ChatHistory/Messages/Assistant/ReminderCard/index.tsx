import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { CalendarBlank, CaretRight, Clock } from "phosphor-react-native";
import moment from "moment";
import { useTranslation } from "react-i18next";
import { type IAgentAction, type IReminderAction } from "@/database/models/WorkspaceChat";
import { formatReminderWhen, openReminder } from "@/utils/reminders";
import { showToast } from "@/utils/Notification";

/**
 * One card per reminder the user approved in this turn (persisted as a `reminder_set` action):
 * what it is for and when it fires. Until it goes off, tapping opens the clock app's alarms or
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
    /** Same blue as the other chat cards */
    accent: '#84CAFF',
    /** zinc-500 - the reminder has gone off */
    spent: '#71717A',
} as const;

/** Just the title and when it fires - whether the clock app holds it as an alarm or a timer does not matter to the user. */
function ReminderCard({ action }: { action: IReminderAction }) {
    const { t } = useTranslation();
    const { kind, label, fireAt } = action.action;
    const Icon = kind === 'calendar' ? CalendarBlank : Clock;
    const passed = fireAt <= Date.now();
    const when = formatReminderWhen(fireAt);
    const status = passed ? t('chat.reminder_card.passed') : moment(fireAt).fromNow();

    const content = (
        <>
            <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                <Icon size={22} color={passed ? COLORS.spent : COLORS.accent} />
            </View>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: COLORS.text }} className="text-base font-medium">{label}</Text>
                <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{when}</Text>
                <Text numberOfLines={1} style={{ color: passed ? COLORS.spent : COLORS.accent }} className="text-xs font-medium">{status}</Text>
            </View>
        </>
    );
    const style = { backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, width: '100%' } as const;

    // A reminder that has gone off has nothing left to open.
    if (passed) {
        return <View style={style} className="flex flex-row items-center">{content}</View>;
    }

    const open = () => openReminder(action.action).catch(() => showToast(t(kind === 'calendar' ? 'chat.reminder_card.open_calendar_failed' : 'chat.reminder_card.open_clock_failed')));
    return (
        <TouchableOpacity
            onPress={open}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.reminder_card.open_label', { label, when })}
            style={style}
            className="flex flex-row items-center">
            {content}
            <View className="flex flex-row items-center" style={{ gap: 2 }}>
                <Text style={{ color: COLORS.accent }} className="text-sm font-medium">{t('chat.reminder_card.view')}</Text>
                <CaretRight size={14} color={COLORS.accent} />
            </View>
        </TouchableOpacity>
    );
}
