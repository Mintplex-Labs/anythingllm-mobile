import { useEffect, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowClockwise, ArrowLeft, ArrowRight, Check, Eye, HandPointing, Stop, X } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import BrowserUse, { useBrowserUse, type ViewerState } from '@/utils/BrowserUse';
import { BrowserNative, BrowserUseHostView, type BrowserStatus } from '@/utils/BrowserUse/native';
import { normalizeUrl } from '@/utils/BrowserUse/urls';

/**
 * Full-screen browser over the app - the mobile counterpart of the desktop's "show the hidden
 * window". The session's WebView is moved into this screen while it is open and goes back behind
 * the app when it closes, so the page never reloads.
 *
 * - watch: the agent keeps working; the page does not take touches.
 * - takeover: the agent asked for help and is waiting; the user drives the page, then taps Done.
 * - browse: a profile's browser for the user - signing in to sites from Settings, or picking up
 *   where a finished session left off (its cart, its draft). Chrome cannot see these sign-ins.
 *
 * Rendered over the navigator rather than in a Modal so the WebView stays in the app's window.
 */
export default function BrowserUseViewerHost() {
    const hub = useBrowserUse();
    const viewer = hub.viewerState;
    if (!viewer || !BrowserUseHostView) return null;
    return <BrowserUseViewer key={viewer.sessionId} viewer={viewer} />;
}

const EMPTY_STATUS: BrowserStatus = { url: null, title: null, loading: false, progress: 0, canGoBack: false, canGoForward: false, crashed: false };

function BrowserUseViewer({ viewer }: { viewer: NonNullable<ViewerState> }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const hub = useBrowserUse();
    const [status, setStatus] = useState<BrowserStatus>(EMPTY_STATUS);
    const [address, setAddress] = useState('');
    const [editingAddress, setEditingAddress] = useState(false);
    const { sessionId, mode } = viewer;
    const agent = hub.agent(sessionId);
    const interactive = mode !== 'watch';
    const HostView = BrowserUseHostView!;

    useEffect(() => {
        BrowserNative.status(sessionId).then(setStatus).catch(() => { });
        return BrowserNative.onStatus((event) => {
            if (event.sessionId !== sessionId) return;
            setStatus(event);
        });
    }, [sessionId]);

    useEffect(() => {
        if (!editingAddress) setAddress(status.url || '');
    }, [status.url, editingAddress]);

    // Back goes back in the page while the user drives it, otherwise closes the viewer.
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (interactive && status.canGoBack) BrowserNative.history(sessionId, 'back').catch(() => { });
            else BrowserUse.closeViewer();
            return true;
        });
        return () => subscription.remove();
    }, [interactive, status.canGoBack, sessionId]);

    const host = (() => {
        try { return status.url ? new URL(status.url).host.replace(/^www\./, '') : ''; } catch { return ''; }
    })();

    const openAddress = () => {
        const url = normalizeUrl(address);
        Keyboard.dismiss();
        setEditingAddress(false);
        if (url) BrowserNative.navigate(sessionId, url).catch(() => { });
    };

    /** Takeover: hand the page back and tell the agent to carry on */
    const handBack = () => {
        Keyboard.dismiss();
        BrowserUse.reply(sessionId, '');
    };

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0E0F0F', zIndex: 1000, elevation: 1000 }]}>
            <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}>
                <View className="flex flex-row items-center" style={{ gap: 10 }}>
                    <TouchableOpacity onPress={() => BrowserUse.closeViewer()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('browser_use.viewer.close')}>
                        <X size={22} color="#FFF" weight="bold" />
                    </TouchableOpacity>
                    {mode === 'browse' ? (
                        <TextInput
                            value={address}
                            onChangeText={setAddress}
                            onFocus={() => setEditingAddress(true)}
                            onBlur={() => setEditingAddress(false)}
                            onSubmitEditing={openAddress}
                            selectTextOnFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="go"
                            placeholder={t('browser_use.viewer.address_placeholder')}
                            placeholderTextColor="#71717A"
                            style={{ flex: 1, height: 38, borderRadius: 19, backgroundColor: '#1B1B1E', color: '#FFF', paddingHorizontal: 14, fontSize: 14 }}
                        />
                    ) : (
                        <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} className="text-white text-base font-medium">{status.title || host || t('browser_use.card.title')}</Text>
                            {!!host && <Text numberOfLines={1} style={{ color: '#9F9FA0' }} className="text-xs">{host}</Text>}
                        </View>
                    )}
                    {interactive && (
                        <TouchableOpacity onPress={() => BrowserNative.history(sessionId, status.loading ? 'stop' : 'reload').catch(() => { })} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('browser_use.viewer.reload')}>
                            {status.loading ? <X size={20} color="#FFF" /> : <ArrowClockwise size={20} color="#FFF" />}
                        </TouchableOpacity>
                    )}
                </View>
                {mode !== 'browse' && (
                    <View className="flex flex-row items-center rounded-lg" style={{ backgroundColor: mode === 'takeover' ? 'rgba(253,176,34,0.12)' : '#1B1B1E', padding: 10, gap: 8 }}>
                        {mode === 'takeover' ? <HandPointing size={16} color="#FDB022" /> : <Eye size={16} color="#84CAFF" />}
                        <Text numberOfLines={3} style={{ flex: 1, color: mode === 'takeover' ? '#FDB022' : '#D4D4D8' }} className="text-xs">
                            {mode === 'takeover'
                                ? agent?.question || t('browser_use.viewer.takeover_hint')
                                : agent?.snapshot.step?.label || t('browser_use.viewer.watch_hint')}
                        </Text>
                    </View>
                )}
            </View>
            {status.loading && (
                <View style={{ height: 2, backgroundColor: '#1B1B1E' }}>
                    <View style={{ height: 2, width: `${Math.max(5, status.progress)}%`, backgroundColor: '#84CAFF' }} />
                </View>
            )}

            <HostView sessionId={sessionId} interactive={interactive} style={{ flex: 1, backgroundColor: '#FFFFFF' }} />

            {status.crashed && (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]} pointerEvents="none">
                    <Text style={{ color: '#9F9FA0', textAlign: 'center' }} className="text-sm">{t('browser_use.viewer.crashed')}</Text>
                </View>
            )}

            <View className="flex flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10, gap: 10, backgroundColor: '#0E0F0F' }}>
                {interactive && (
                    <>
                        <NavButton disabled={!status.canGoBack} onPress={() => BrowserNative.history(sessionId, 'back')} label={t('browser_use.viewer.back')}>
                            <ArrowLeft size={20} color={status.canGoBack ? '#FFF' : '#52525B'} />
                        </NavButton>
                        <NavButton disabled={!status.canGoForward} onPress={() => BrowserNative.history(sessionId, 'forward')} label={t('browser_use.viewer.forward')}>
                            <ArrowRight size={20} color={status.canGoForward ? '#FFF' : '#52525B'} />
                        </NavButton>
                    </>
                )}
                <View style={{ flex: 1 }} />
                {mode === 'watch' && (
                    <ActionButton onPress={() => { BrowserUse.stop(sessionId); BrowserUse.closeViewer(); }} label={t('browser_use.card.stop')} icon={<Stop size={16} color="#FFF" weight="fill" />} />
                )}
                {mode === 'takeover' && (
                    <ActionButton primary onPress={handBack} label={t('browser_use.viewer.done_continue')} icon={<Check size={16} color="#000" weight="bold" />} />
                )}
                {mode === 'browse' && (
                    <ActionButton primary onPress={() => BrowserUse.closeViewer()} label={t('browser_use.viewer.done')} icon={<Check size={16} color="#000" weight="bold" />} />
                )}
            </View>
        </View>
    );
}

function NavButton({ children, disabled, onPress, label }: { children: React.ReactNode; disabled: boolean; onPress: () => Promise<unknown>; label: string }) {
    return (
        <TouchableOpacity
            disabled={disabled}
            onPress={() => { onPress().catch(() => { }); }}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1B1B1E' }}
            className="flex items-center justify-center"
        >
            {children}
        </TouchableOpacity>
    );
}

function ActionButton({ onPress, label, icon, primary = false }: { onPress: () => void; label: string; icon: React.ReactNode; primary?: boolean }) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPress}
            accessibilityRole="button"
            style={{ height: 40, borderRadius: 8, paddingHorizontal: 16, backgroundColor: primary ? '#FFFFFF' : '#3F3F46', gap: 6 }}
            className="flex flex-row items-center justify-center"
        >
            {icon}
            <Text style={{ color: primary ? '#000' : '#FFF' }} className="text-sm font-medium">{label}</Text>
        </TouchableOpacity>
    );
}
