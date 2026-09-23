import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowLeft } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ScheduledJobRunStatus } from '@/database/models/ScheduledJobRun';

/** Palette shared by the scheduled jobs screens - matches the user settings screens */
export const JOB_COLORS = {
    page: '#0E0F0F',
    card: '#1B1B1E',
    row: '#27282A',
    chip: '#3f3f42',
    text: '#FFFFFF',
    muted: '#9F9FA0',
    accent: '#84CAFF',
    success: '#46C08A',
    danger: '#F97066',
    warning: '#FDB022',
    dangerBackground: 'rgba(122,39,26,0.2)',
} as const;

/** Centered title with a back arrow on the left and an optional action on the right (settings screen header) */
export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 16 }} className="w-full flex flex-row items-center justify-center relative">
            <TouchableOpacity onPress={onBack} className="absolute left-0 flex flex-row items-center gap-2" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Back">
                <ArrowLeft size={24} color="#FFF" weight="bold" />
            </TouchableOpacity>
            <View className="flex flex-col items-center" style={{ maxWidth: '70%' }}>
                <Text numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">{title}</Text>
                {!!subtitle && <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: JOB_COLORS.muted }} className="text-sm">{subtitle}</Text>}
            </View>
            {right !== undefined && <View className="absolute right-0 flex flex-row items-center">{right}</View>}
        </View>
    );
}

/** Uppercase muted section label */
export function SectionLabel({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
    return (
        <View className="flex flex-row items-end justify-between">
            <Text style={{ color: JOB_COLORS.muted }} className="text-sm uppercase">{children}</Text>
            {trailing}
        </View>
    );
}

/** Dark rounded container the settings screens use for grouped rows */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return (
        <View className="flex flex-col" style={[{ backgroundColor: JOB_COLORS.card, padding: 14, gap: 12, borderRadius: 8 }, style]}>
            {children}
        </View>
    );
}

/** Small accent dot marking something the user has not seen yet */
export function UnreadDot({ size = 8, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
    return <View accessibilityLabel="Unseen" style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: JOB_COLORS.accent }, style]} />;
}

/** Selectable pill - used for frequency, weekday and time choices */
export function Chip({ label, selected, onPress, disabled = false, style }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            style={[{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                opacity: disabled ? 0.4 : 1,
            }, style]}>
            <Text style={{ color: selected ? '#0E0F0F' : JOB_COLORS.text }} className="text-sm font-medium">{label}</Text>
        </TouchableOpacity>
    );
}

/** Full-width action button. `tone` picks the accent: primary (white), secondary (translucent) or danger. */
export function ActionButton({ title, onPress, tone = 'primary', disabled = false, loading = false, icon }: {
    title: string;
    onPress: () => void;
    tone?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
}) {
    const background = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? JOB_COLORS.dangerBackground : 'rgba(255,255,255,0.1)';
    const color = tone === 'primary' ? '#0E0F0F' : tone === 'danger' ? JOB_COLORS.danger : '#FFFFFF';
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
            style={{ backgroundColor: background, opacity: disabled ? 0.4 : 1, paddingVertical: 14, borderRadius: 8, gap: 8 }}
            className="flex flex-row items-center justify-center">
            {loading ? <ActivityIndicator size="small" color={color} /> : icon}
            <Text style={{ color }} className="text-lg font-medium">{title}</Text>
        </TouchableOpacity>
    );
}

export const RUN_STATUS_LABELS: Record<ScheduledJobRunStatus, string> = {
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    timed_out: 'Timed out',
    cancelled: 'Stopped',
};

export function runStatusColor(status: ScheduledJobRunStatus): string {
    switch (status) {
        case 'completed': return JOB_COLORS.success;
        case 'failed': return JOB_COLORS.danger;
        case 'timed_out':
        case 'cancelled': return JOB_COLORS.warning;
        case 'running':
        case 'queued':
        default: return JOB_COLORS.accent;
    }
}

/** Status word colored by outcome, with a spinner while the run is in flight */
export function RunStatusLabel({ status, size = 'sm' }: { status: ScheduledJobRunStatus; size?: 'sm' | 'md' }) {
    const inFlight = status === 'running' || status === 'queued';
    return (
        <View className="flex flex-row items-center" style={{ gap: 6 }}>
            {inFlight && <ActivityIndicator size="small" color={runStatusColor(status)} style={{ transform: [{ scale: 0.7 }] }} />}
            <Text style={{ color: runStatusColor(status) }} className={size === 'md' ? 'text-base font-medium' : 'text-sm font-medium'}>
                {RUN_STATUS_LABELS[status] ?? status}
            </Text>
        </View>
    );
}

/** Amber notice used when jobs cannot run with the current LLM provider */
export function NoticeBanner({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
    return (
        <View style={{ backgroundColor: 'rgba(253,176,34,0.12)', borderColor: 'rgba(253,176,34,0.4)', borderWidth: 1, borderRadius: 8, padding: 14, gap: 6 }}>
            <Text style={{ color: JOB_COLORS.warning }} className="text-base font-semibold">{title}</Text>
            <Text style={{ color: JOB_COLORS.text }} className="text-sm">{body}</Text>
            {action && (
                <TouchableOpacity onPress={action.onPress} style={{ marginTop: 4 }}>
                    <Text style={{ color: JOB_COLORS.warning }} className="text-sm font-medium">{action.label}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

/** Relative "in 2h" / "3 min ago" style label, or an absolute date when far away */
export function formatRelativeTime(timestamp: number | null | undefined, now: number = Date.now()): string {
    if (!timestamp) return '—';
    const diff = timestamp - now;
    const abs = Math.abs(diff);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const suffix = (label: string) => (diff >= 0 ? `in ${label}` : `${label} ago`);
    if (abs < minute) return diff >= 0 ? 'in under a minute' : 'just now';
    if (abs < hour) return suffix(`${Math.round(abs / minute)} min`);
    if (abs < day) {
        const hours = Math.floor(abs / hour);
        const minutes = Math.round((abs % hour) / minute);
        return suffix(minutes ? `${hours}h ${minutes}m` : `${hours}h`);
    }
    if (abs < 7 * day) return suffix(`${Math.round(abs / day)}d`);
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `Sep 18, 9:00 AM` */
export function formatDateTime(timestamp: number | null | undefined): string {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
