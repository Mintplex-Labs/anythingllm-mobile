import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, PaperPlaneTilt, WarningCircle } from 'phosphor-react-native';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import BrowserTraces, { type BrowserTrace, type BrowserTraceStatus, type BrowserTraceStep } from '@/utils/BrowserUse/traces';

/**
 * Step-by-step history of one browser agent session: every page it opened, what it clicked and
 * typed, and what it sent to sites - the mobile counterpart of the desktop TraceModal. Opened
 * from a finished session card in the chat and from Settings > Browser use.
 */

export const BROWSER_STATUS_COLORS: Record<BrowserTraceStatus, string> = {
    running: '#84CAFF',
    'needs-help': '#FDB022',
    done: '#46C08A',
    incomplete: '#FDB022',
    failed: '#F97066',
    stopped: '#A1A1AA',
};

/** Translated label for a session status */
export function useBrowserStatusLabel() {
    const { t } = useTranslation();
    return (status: BrowserTraceStatus) => t(`browser_use.status.${status.replace('-', '_')}`);
}

export default function BrowserTraceModal({ traceId, onClose }: { traceId: string | null; onClose: () => void }) {
    return (
        <Modal visible={!!traceId} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            {traceId ? <BrowserTraceView traceId={traceId} onBack={onClose} /> : null}
        </Modal>
    );
}

export function BrowserTraceView({ traceId, onBack }: { traceId: string; onBack: () => void }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const statusLabel = useBrowserStatusLabel();
    const [trace, setTrace] = useState<BrowserTrace | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        BrowserTraces.get(traceId).then((value) => { if (!cancelled) setTrace(value); });
        return () => { cancelled = true; };
    }, [traceId]);

    return (
        <View style={{ flex: 1, backgroundColor: '#0E0F0F', paddingTop: insets.top + 12 }}>
            <View className="w-full flex flex-row items-center justify-center relative" style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <TouchableOpacity onPress={onBack} hitSlop={10} className="absolute flex flex-row items-center" style={{ left: 16 }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text className="text-white text-lg font-medium">{t('browser_use.trace.title')}</Text>
            </View>

            {trace === undefined ? (
                <ActivityIndicator style={{ marginTop: 40 }} color="#FFF" />
            ) : trace === null ? (
                <Text style={{ color: '#9F9FA0', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }} className="text-sm">{t('browser_use.trace.missing')}</Text>
            ) : (
                <FlatList
                    data={trace.steps}
                    keyExtractor={(_, index) => String(index)}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
                    ListHeaderComponent={
                        <View style={{ gap: 6, marginBottom: 12 }}>
                            <Text className="text-white text-base">{trace.task}</Text>
                            <Text style={{ color: BROWSER_STATUS_COLORS[trace.status] }} className="text-sm font-medium">{statusLabel(trace.status)}</Text>
                            <Text style={{ color: '#9F9FA0' }} className="text-xs">
                                {[
                                    moment(trace.startedAt).format('lll'),
                                    t('browser_use.trace.profile', { name: trace.profile }),
                                    t('browser_use.trace.steps', { count: trace.steps.length }),
                                    trace.tokens.total ? t('browser_use.trace.tokens', { count: Math.round(trace.tokens.total / 100) / 10 }) : null,
                                    trace.model,
                                ].filter(Boolean).join(' · ')}
                            </Text>
                            {!!trace.summary && (
                                <View style={{ backgroundColor: '#1B1B1E', borderRadius: 8, padding: 12, marginTop: 6 }}>
                                    <Text style={{ color: '#D4D4D8', lineHeight: 20 }} className="text-sm">{trace.summary}</Text>
                                </View>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => <TraceStepRow step={item} />}
                />
            )}
        </View>
    );
}

function TraceStepRow({ step }: { step: BrowserTraceStep }) {
    let host = '';
    try { host = step.url ? new URL(step.url).host.replace(/^www\./, '') : ''; } catch { }
    return (
        <View className="flex flex-row rounded-lg" style={{ backgroundColor: '#1B1B1E', padding: 10, gap: 10 }}>
            {step.thumbnail ? (
                <Image source={{ uri: `data:image/jpeg;base64,${step.thumbnail}` }} style={{ width: 54, height: 96, borderRadius: 4, backgroundColor: '#27272A' }} resizeMode="cover" />
            ) : (
                <View style={{ width: 54, height: 96, borderRadius: 4, backgroundColor: '#27272A' }} />
            )}
            <View style={{ flex: 1, gap: 4 }}>
                <View className="flex flex-row items-start" style={{ gap: 6 }}>
                    {step.ok ? <CheckCircle size={16} color="#46C08A" weight="fill" style={{ marginTop: 2 }} /> : <WarningCircle size={16} color="#F97066" weight="fill" style={{ marginTop: 2 }} />}
                    <Text className="text-white text-sm" style={{ flex: 1 }}>{step.label}</Text>
                </View>
                {!!(step.title || host) && (
                    <Text numberOfLines={2} style={{ color: '#9F9FA0' }} className="text-xs">{[step.title, host].filter(Boolean).join(' - ')}</Text>
                )}
                {(step.sent || []).map((request, index) => (
                    <View key={index} className="flex flex-row items-center" style={{ gap: 4 }}>
                        <PaperPlaneTilt size={12} color="#84CAFF" />
                        <Text numberOfLines={1} style={{ color: '#84CAFF', flex: 1 }} className="text-xs">
                            {`${request.method} ${request.label}${request.status ? ` - ${request.status}` : ''}`}
                        </Text>
                    </View>
                ))}
                <Text style={{ color: '#71717A' }} className="text-xs">{moment(step.at).format('LTS')}</Text>
            </View>
        </View>
    );
}
