import { memo, useEffect, useState, type ReactNode } from "react";
import { Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { CalendarPlus, CaretRight, ChatCircleText, EnvelopeSimple } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { type IAgentAction } from "@/database/models/WorkspaceChat";
import {
    getDraftApps,
    getPreferredApp,
    normalizeEmailDraft,
    normalizeTextDraft,
    onPreferredAppChanged,
    openEmailLink,
    shareDraft,
    type DraftKind,
    type EmailDraft,
    type MessagingApp,
    type TextDraft,
} from "@/utils/messaging";
import { describeRecurrence, formatEventWhen, normalizeCalendarEvent, saveCalendarEventOnIos, type CalendarEvent } from "@/utils/calendar";
import useCalendarApp from "@/hooks/useCalendarApp";
import { showToast } from "@/utils/Notification";
import { focusCalendarEvent, focusEmailDraft, focusTextDraft } from "@/screens/WorkspaceChat/ChatHistory/DraftSheet";

/**
 * Cards for the texts, emails and calendar events the assistant drafted in this turn
 * (`text_draft` / `email_draft` / `calendar_event_creation` actions, plus the old `sms` / `email`
 * link actions). We can never send or save them ourselves - tapping one opens the app picker
 * (DraftSheet), which hands the draft to the user's messaging, mail or calendar app (events can
 * also be saved as an .ics file). The last app used shows on the card.
 *
 * Like file cards, they wait for the reply to finish so streaming text does not keep pushing them around.
 */
export const TextDraftCards = memo(function TextDraftCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    if (isLoading) return null;
    const drafts = actions.map(normalizeTextDraft).filter((draft): draft is TextDraft => !!draft);
    if (drafts.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {drafts.map((draft, index) => <TextDraftCard key={`text-draft-${index}`} draft={draft} />)}
        </View>
    );
});

export const EmailDraftCards = memo(function EmailDraftCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    if (isLoading) return null;
    const drafts = actions.map(normalizeEmailDraft).filter((draft): draft is EmailDraft => !!draft);
    if (drafts.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {drafts.map((draft, index) => <EmailDraftCard key={`email-draft-${index}`} draft={draft} />)}
        </View>
    );
});

export const CalendarEventCards = memo(function CalendarEventCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    if (isLoading) return null;
    const events = actions.map(normalizeCalendarEvent).filter((event): event is CalendarEvent => !!event);
    if (events.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {events.map((event, index) => <CalendarEventCard key={`calendar-event-${index}`} event={event} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 - same surface as the file download and scheduled job cards */
    card: '#27272A',
    iconChip: '#3F3F46',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    accent: '#84CAFF',
} as const;

/** The last used app for this kind of draft, if it is still installed and listed. Always null off Android. */
function usePreferredApp(kind: DraftKind): MessagingApp | null {
    const [preferred, setPreferred] = useState<MessagingApp | null>(null);
    useEffect(() => {
        let cancelled = false;
        const resolve = (packageName: string | null) => getDraftApps(kind).then(apps => {
            if (!cancelled) setPreferred(apps.find(app => app.packageName === packageName) ?? null);
        });
        getPreferredApp(kind).then(resolve);
        const unsubscribe = onPreferredAppChanged((changedKind, packageName) => {
            if (changedKind === kind) resolve(packageName);
        });
        return () => { cancelled = true; unsubscribe(); };
    }, [kind]);
    return preferred;
}

function TextDraftCard({ draft }: { draft: TextDraft }) {
    const { t } = useTranslation();
    const preferred = usePreferredApp('text');
    const title = draft.recipientName ?? draft.phoneNumber ?? t('chat.text_draft.new_message');

    function open() {
        // iOS has no app list - the share sheet is the picker.
        if (Platform.OS === 'android') return focusTextDraft(draft);
        shareDraft(draft).catch(() => showToast(t('chat.text_draft.open_failed')));
    }

    return (
        <DraftCard
            icon={<ChatCircleText size={22} color={COLORS.accent} />}
            title={title}
            app={preferred}
            actionLabel={t('chat.draft.open')}
            accessibilityLabel={t('chat.text_draft.open_label', { recipient: title })}
            onPress={open}>
            <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{draft.body}</Text>
        </DraftCard>
    );
}

function EmailDraftCard({ draft }: { draft: EmailDraft }) {
    const { t } = useTranslation();
    const preferred = usePreferredApp('email');
    const subject = draft.subject || t('chat.email_draft.no_subject');
    const addresses = draft.to.length ? draft.to.join(', ') : null;
    const recipient = draft.recipientName && addresses
        ? `${draft.recipientName} · ${addresses}`
        : draft.recipientName ?? addresses ?? t('chat.email_draft.no_recipient');

    function open() {
        // iOS has no app list - mailto opens the default mail app.
        if (Platform.OS === 'android') return focusEmailDraft(draft);
        openEmailLink(draft).catch(() => showToast(t('chat.email_draft.open_failed')));
    }

    // Subject up top, who it is for as a hint under it, then a snippet of the body.
    return (
        <DraftCard
            icon={<EnvelopeSimple size={22} color={COLORS.accent} />}
            title={subject}
            app={preferred}
            actionLabel={t('chat.draft.open')}
            accessibilityLabel={t('chat.email_draft.open_label', { subject })}
            onPress={open}>
            <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">{recipient}</Text>
            {!!draft.body && <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{draft.body}</Text>}
        </DraftCard>
    );
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
    const { t } = useTranslation();
    const preferred = usePreferredApp('calendar');
    // Before the user has picked one, show the calendar app Android would use.
    const defaultApp = useCalendarApp();
    const detail = event.eventLocation || event.description;

    function add() {
        // Android picks the app (or an .ics file) in the draft sheet - iOS has no app list, it saves straight to Calendar.
        if (Platform.OS === 'android') return focusCalendarEvent(event);
        saveCalendarEventOnIos(event)
            .then(() => showToast(t('chat.calendar_event.saved')))
            .catch((error: unknown) => {
                console.error('[CalendarEventCard] add failed', error);
                showToast(error instanceof Error && error.message === 'calendar_permission_denied'
                    ? t('chat.calendar_event.permission_denied')
                    : t('chat.calendar_event.open_failed'));
            });
    }

    // Title up top, when it is as a hint under it, then where (or what) it is.
    return (
        <DraftCard
            icon={<CalendarPlus size={22} color={COLORS.accent} />}
            title={event.title}
            app={preferred ?? defaultApp}
            actionLabel={t('chat.calendar_event.add')}
            accessibilityLabel={t('chat.calendar_event.open_label', { title: event.title })}
            onPress={add}>
            <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">
                {[formatEventWhen(event, t('chat.calendar_event.all_day')), event.recurrence ? describeRecurrence(event.recurrence, false) : null].filter(Boolean).join(' · ')}
            </Text>
            {!!detail && <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{detail}</Text>}
        </DraftCard>
    );
}

/** Shared shell: icon chip, a title with detail lines under it, and the app it opens in (or the action label) on the right */
function DraftCard({ icon, title, app, actionLabel, accessibilityLabel, onPress, children }: {
    icon: ReactNode;
    title: string;
    app: MessagingApp | null;
    actionLabel: string;
    accessibilityLabel: string;
    onPress: () => void;
    children: ReactNode;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, width: '100%' }}
            className="flex flex-row items-center">
            <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                {icon}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }} className="flex flex-col">
                <Text numberOfLines={1} style={{ color: COLORS.text }} className="text-base font-medium">{title}</Text>
                {children}
            </View>
            {app?.icon ? (
                <Image source={{ uri: app.icon }} accessibilityLabel={app.label} style={{ width: 26, height: 26, borderRadius: 13 }} />
            ) : (
                <View className="flex flex-row items-center" style={{ gap: 2 }}>
                    <Text style={{ color: COLORS.accent }} className="text-sm font-medium">{actionLabel}</Text>
                    <CaretRight size={14} color={COLORS.accent} />
                </View>
            )}
        </TouchableOpacity>
    );
}
