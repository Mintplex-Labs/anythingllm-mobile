import { memo, useEffect, useState } from "react";
import { Image, Platform, Text, TouchableOpacity, View } from "react-native";
import { CaretRight, ChatCircleText } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { type IAgentAction } from "@/database/models/WorkspaceChat";
import {
    getMessagingApps,
    getPreferredApp,
    normalizeTextDraft,
    onPreferredAppChanged,
    shareDraft,
    type MessagingApp,
    type TextDraft,
} from "@/utils/messaging";
import { showToast } from "@/utils/Notification";
import { focusTextDraft } from "@/screens/WorkspaceChat/ChatHistory/TextDraftSheet";

/**
 * One card per text message the assistant drafted in this turn (`text_draft` actions, plus the
 * old `sms` link actions). We can never send the text - tapping hands it to the user's messaging
 * app with the recipient and body filled in.
 *
 * Tapping opens the app picker (TextDraftSheet). The last app used shows on the card and is
 * listed first in the picker.
 */
export default memo(function TextDraftCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    // Like file cards, wait for the reply to finish so streaming text does not keep pushing the card around.
    if (isLoading) return null;
    const drafts = actions.map(normalizeTextDraft).filter((draft): draft is TextDraft => !!draft);
    if (drafts.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {drafts.map((draft, index) => <TextDraftCard key={`text-draft-${index}`} draft={draft} />)}
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

/** The last used messaging app, if it is still installed and listed. Always null off Android. */
function usePreferredApp(): MessagingApp | null {
    const [preferred, setPreferred] = useState<MessagingApp | null>(null);
    useEffect(() => {
        let cancelled = false;
        const resolve = (packageName: string | null) => getMessagingApps().then(apps => {
            if (!cancelled) setPreferred(apps.find(app => app.packageName === packageName) ?? null);
        });
        getPreferredApp().then(resolve);
        const unsubscribe = onPreferredAppChanged(resolve);
        return () => { cancelled = true; unsubscribe(); };
    }, []);
    return preferred;
}

function TextDraftCard({ draft }: { draft: TextDraft }) {
    const { t } = useTranslation();
    const preferred = usePreferredApp();
    const title = draft.recipientName ?? draft.phoneNumber ?? t('chat.text_draft.new_message');

    function open() {
        // iOS has no app list - the share sheet is the picker.
        if (Platform.OS === 'android') return focusTextDraft(draft);
        shareDraft(draft).catch(() => showToast(t('chat.text_draft.open_failed')));
    }

    return (
        <TouchableOpacity
            onPress={open}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.text_draft.open_label', { recipient: title })}
            style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, width: '100%' }}
            className="flex flex-row items-center">
            <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                <ChatCircleText size={22} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }} className="flex flex-col">
                <Text numberOfLines={1} style={{ color: COLORS.text }} className="text-base font-medium">{title}</Text>
                <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">{draft.body}</Text>
            </View>
            {preferred?.icon ? (
                <Image source={{ uri: preferred.icon }} accessibilityLabel={preferred.label} style={{ width: 26, height: 26, borderRadius: 13 }} />
            ) : (
                <View className="flex flex-row items-center" style={{ gap: 2 }}>
                    <Text style={{ color: COLORS.accent }} className="text-sm font-medium">{t('chat.text_draft.open')}</Text>
                    <CaretRight size={14} color={COLORS.accent} />
                </View>
            )}
        </TouchableOpacity>
    );
}
