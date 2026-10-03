import { memo, useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ArrowSquareOut, Browser, Eye, HandPointing, ListBullets, Stop } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import { type IAgentAction, type IBrowserUseSessionAction } from "@/database/models/WorkspaceChat";
import { useBrowserUse } from "@/utils/BrowserUse";
import { type BrowserSessionSnapshot } from "@/utils/BrowserUse/agent";
import BrowserTraceModal, { BROWSER_STATUS_COLORS, useBrowserStatusLabel } from "@/components/BrowserUseTrace";
import { showToast } from "@/utils/Notification";

/**
 * Native port of the desktop `BrowserUseSession` chat card
 * (frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/BrowserUseSession).
 *
 * While the agent runs the card shows the latest screen, the current step and Watch / Stop. When
 * the agent asks for help (sign in, a captcha, a verification code, a decision) it shows the
 * question with "Open browser" to take over the page and a reply box. Once the session ends the
 * card collapses to its outcome with a link to the step history and "Open in browser", which opens
 * the in-app browser on the session's profile at its last page - the only browser that has the
 * session's sign-ins, so a cart the agent filled can be checked out there. The snapshot is saved with the
 * chat; whether the session is still live comes from the BrowserUse hub, so a chat reopened after
 * the app restarted shows a stale running session as interrupted.
 */
export default memo(function BrowserUseSessionCards({ actions = [] }: { actions?: IAgentAction[] }) {
    const sessions = actions.filter((action): action is IBrowserUseSessionAction => action.type === 'browser_use_session');
    if (sessions.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {sessions.map((action) => <BrowserUseSessionCard key={action.action.sessionId} snapshot={action.action} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 - same surface as the other chat cards */
    card: '#27272A',
    iconChip: '#3F3F46',
    button: '#3F3F46',
    input: '#18181B',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    accent: '#84CAFF',
    help: '#FDB022',
    helpBackground: 'rgba(253,176,34,0.12)',
} as const;

function BrowserUseSessionCard({ snapshot }: { snapshot: BrowserSessionSnapshot }) {
    const { t } = useTranslation();
    const hub = useBrowserUse();
    const statusLabel = useBrowserStatusLabel();
    const [reply, setReply] = useState('');
    const [traceOpen, setTraceOpen] = useState(false);
    const live = hub.isLive(snapshot.sessionId);
    const ended = !!snapshot.endedAt;
    const interrupted = !live && !ended;
    const needsHelp = live && snapshot.status === 'needs-help' && !!snapshot.question;
    const frame = live ? hub.frame(snapshot.sessionId) : null;
    const status = interrupted ? t('browser_use.status.interrupted') : statusLabel(snapshot.status);
    const statusColor = interrupted ? COLORS.muted : BROWSER_STATUS_COLORS[snapshot.status];
    const sites = snapshot.sites.map((site) => site.host.replace(/^www\./, ''));
    const lastUrl = [...snapshot.recentSteps].reverse().find((step) => step.url)?.url || snapshot.step?.url || null;

    const openInBrowser = () => {
        if (!lastUrl) return;
        hub.openBrowser({ profileName: snapshot.profile, url: lastUrl })
            .catch((error) => showToast((error as Error)?.message || t('chat.errors.processing')));
    };

    const sendReply = () => {
        hub.reply(snapshot.sessionId, reply);
        setReply('');
    };

    return (
        <View style={{ width: '100%', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12 }}>
            <View className="flex flex-row items-center" style={{ gap: 12 }}>
                <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                    <Browser size={22} color={COLORS.accent} />
                </View>
                <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: COLORS.text }} className="text-base font-medium">{t('browser_use.card.title')}</Text>
                    <Text numberOfLines={1} style={{ color: statusColor }} className="text-xs font-medium">
                        {status}{snapshot.stepCount ? ` · ${t('browser_use.trace.steps', { count: snapshot.stepCount })}` : ''}
                    </Text>
                </View>
            </View>

            <Text numberOfLines={live ? 2 : 3} style={{ color: COLORS.muted, lineHeight: 20 }} className="text-sm">{snapshot.task}</Text>

            {live && !needsHelp && (
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => hub.openViewer(snapshot.sessionId, 'watch')}
                    accessibilityRole="button"
                    accessibilityLabel={t('browser_use.card.watch')}
                    className="flex flex-row rounded-lg"
                    style={{ backgroundColor: COLORS.input, padding: 8, gap: 10, alignItems: 'center' }}
                >
                    {frame ? (
                        <Image source={{ uri: `data:image/jpeg;base64,${frame}` }} style={{ width: 54, height: 96, borderRadius: 4 }} resizeMode="cover" />
                    ) : (
                        <View style={{ width: 54, height: 96, borderRadius: 4, backgroundColor: COLORS.iconChip }} />
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text numberOfLines={3} style={{ color: COLORS.text }} className="text-sm">{snapshot.step?.label || t('browser_use.card.starting')}</Text>
                        {!!snapshot.step?.title && <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-xs">{snapshot.step.title}</Text>}
                    </View>
                </TouchableOpacity>
            )}

            {needsHelp && (
                <View style={{ gap: 10 }}>
                    <View style={{ backgroundColor: COLORS.helpBackground, borderRadius: 8, padding: 12, gap: 4 }}>
                        <Text style={{ color: COLORS.help }} className="text-xs font-medium">{t('browser_use.card.needs_help')}</Text>
                        <Text style={{ color: COLORS.text, lineHeight: 20 }} className="text-sm">{snapshot.question}</Text>
                    </View>
                    <CardButton icon={<HandPointing size={16} color="#000" />} label={t('browser_use.card.open_browser')} primary onPress={() => hub.openViewer(snapshot.sessionId, 'takeover')} />
                    <View className="flex flex-row items-center" style={{ gap: 8 }}>
                        <TextInput
                            value={reply}
                            onChangeText={setReply}
                            placeholder={t('browser_use.card.reply_placeholder')}
                            placeholderTextColor="#71717A"
                            onSubmitEditing={sendReply}
                            returnKeyType="send"
                            style={{ flex: 1, backgroundColor: COLORS.input, color: COLORS.text, borderRadius: 8, paddingHorizontal: 12, height: 40 }}
                        />
                        <TouchableOpacity activeOpacity={0.7} onPress={sendReply} style={{ height: 40, borderRadius: 8, backgroundColor: COLORS.button, paddingHorizontal: 14 }} className="flex items-center justify-center">
                            <Text style={{ color: COLORS.text }} className="text-sm font-medium">{t('browser_use.card.continue')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {!live && sites.length > 0 && (
                <Text numberOfLines={2} style={{ color: COLORS.muted }} className="text-xs">{t('browser_use.card.sites', { sites: sites.join(', ') })}</Text>
            )}

            <View className="flex flex-row" style={{ gap: 8 }}>
                {live && !needsHelp && <CardButton icon={<Eye size={16} color={COLORS.text} />} label={t('browser_use.card.watch')} onPress={() => hub.openViewer(snapshot.sessionId, 'watch')} />}
                {live && <CardButton icon={<Stop size={16} color={COLORS.text} weight="fill" />} label={t('browser_use.card.stop')} onPress={() => hub.stop(snapshot.sessionId)} />}
                {!live && snapshot.stepCount > 0 && <CardButton icon={<ListBullets size={16} color={COLORS.text} />} label={t('browser_use.card.view_steps')} onPress={() => setTraceOpen(true)} />}
                {!live && !!lastUrl && <CardButton icon={<ArrowSquareOut size={16} color={COLORS.text} />} label={t('browser_use.card.open_in_browser')} onPress={openInBrowser} />}
            </View>

            <BrowserTraceModal traceId={traceOpen ? snapshot.sessionId : null} onClose={() => setTraceOpen(false)} />
        </View>
    );
}

function CardButton({ icon, label, onPress, primary = false }: { icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPress}
            accessibilityRole="button"
            style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: primary ? '#FFFFFF' : COLORS.button, gap: 6 }}
            className="flex flex-row items-center justify-center"
        >
            {icon}
            <Text style={{ color: primary ? '#000000' : COLORS.text }} className="text-sm font-medium">{label}</Text>
        </TouchableOpacity>
    );
}
