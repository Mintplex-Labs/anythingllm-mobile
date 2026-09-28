import { memo, useEffect, useState, type ReactNode } from "react";
import { Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { CaretRight, ChatCircleText, EnvelopeSimple } from "phosphor-react-native";
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
import { showToast } from "@/utils/Notification";
import { focusEmailDraft, focusTextDraft } from "@/screens/WorkspaceChat/ChatHistory/DraftSheet";

/**
 * Cards for the texts and emails the assistant drafted in this turn (`text_draft` / `email_draft`
 * actions, plus the old `sms` / `email` link actions). We can never send them - tapping opens the
 * app picker (DraftSheet), which hands the draft to the user's messaging or mail app. The last app
 * used shows on the card and is listed first in the picker.
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
    const title = draft.recipientName ?? draft.phoneNumber ?? t('chat.text_draft.new_message');

    function open() {
        // iOS has no app list - the share sheet is the picker.
        if (Platform.OS === 'android') return focusTextDraft(draft);
        shareDraft(draft).catch(() => showToast(t('chat.text_draft.open_failed')));
    }

    return (
        <DraftCard
            kind="text"
            icon={<ChatCircleText size={22} color={COLORS.accent} />}
            title={title}
            accessibilityLabel={t('chat.text_draft.open_label', { recipient: title })}
            onPress={open}>
            <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{draft.body}</Text>
        </DraftCard>
    );
}

function EmailDraftCard({ draft }: { draft: EmailDraft }) {
    const { t } = useTranslation();
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
            kind="email"
            icon={<EnvelopeSimple size={22} color={COLORS.accent} />}
            title={subject}
            accessibilityLabel={t('chat.email_draft.open_label', { subject })}
            onPress={open}>
            <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">{recipient}</Text>
            {!!draft.body && <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{draft.body}</Text>}
        </DraftCard>
    );
}

/** Shared shell: icon chip, a title with detail lines under it, and the last used app (or "Open") on the right */
function DraftCard({ kind, icon, title, accessibilityLabel, onPress, children }: {
    kind: DraftKind;
    icon: ReactNode;
    title: string;
    accessibilityLabel: string;
    onPress: () => void;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const preferred = usePreferredApp(kind);
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
            {preferred?.icon ? (
                <Image source={{ uri: preferred.icon }} accessibilityLabel={preferred.label} style={{ width: 26, height: 26, borderRadius: 13 }} />
            ) : (
                <View className="flex flex-row items-center" style={{ gap: 2 }}>
                    <Text style={{ color: COLORS.accent }} className="text-sm font-medium">{t('chat.draft.open')}</Text>
                    <CaretRight size={14} color={COLORS.accent} />
                </View>
            )}
        </TouchableOpacity>
    );
}
