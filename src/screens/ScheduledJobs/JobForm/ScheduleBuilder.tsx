import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import {
    type BuilderFrequency,
    type BuilderState,
    MINUTE_INTERVALS,
    WEEKDAY_SHORT,
    builderStateToCron,
    cronToBuilderState,
    describeCron,
    formatHourOfDay,
    formatTimeOfDay,
    isValidCron,
} from '@/utils/ScheduledJobs/cron';
import { useTranslation } from 'react-i18next';
import { tKey } from '@/i18n';
import { Chip, JOB_COLORS } from '../components';

export type ScheduleMode = 'builder' | 'cron';

/** `label` is a translation key - resolved with t() when rendered */
const FREQUENCIES: { value: BuilderFrequency; label: string }[] = [
    { value: 'day', label: tKey('scheduled_jobs.builder.daily') },
    { value: 'week', label: tKey('scheduled_jobs.builder.weekly') },
    { value: 'month', label: tKey('scheduled_jobs.builder.monthly') },
    { value: 'hour', label: tKey('scheduled_jobs.builder.hourly') },
    { value: 'minute', label: tKey('scheduled_jobs.builder.every_few_minutes') },
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5);
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Schedule picker for a job. The default "Schedule" mode is a visual builder (daily / weekly /
 * monthly / hourly / every N minutes) that writes a cron expression; "Cron" mode exposes the
 * expression itself for people who want finer control. Mirrors the desktop CronBuilder +
 * JobSchedule pair, laid out for a phone with chips instead of dropdowns.
 */
export default function ScheduleBuilder({ value, mode, onChange, onModeChange }: {
    value: string;
    mode: ScheduleMode;
    onChange: (cron: string) => void;
    onModeChange: (mode: ScheduleMode) => void;
}) {
    const { t } = useTranslation();
    const [state, setState] = useState<BuilderState>(() => cronToBuilderState(value).state);

    // Switching to the builder from a cron the builder can show keeps its settings; otherwise start from the defaults.
    useEffect(() => {
        if (mode !== 'builder') return;
        const parsed = cronToBuilderState(value);
        setState(parsed.state);
        if (!parsed.matched) onChange(builderStateToCron(parsed.state));
    }, [mode]);

    const update = (patch: Partial<BuilderState>) => {
        const next = { ...state, ...patch };
        setState(next);
        onChange(builderStateToCron(next));
    };

    const valid = isValidCron(value);
    const showsTime = state.frequency === 'day' || state.frequency === 'week' || state.frequency === 'month';

    return (
        <View className="flex flex-col" style={{ gap: 16 }}>
            {/* Mode switch */}
            <View className="flex flex-row" style={{ backgroundColor: JOB_COLORS.row, borderRadius: 8, padding: 4, gap: 4 }}>
                {([['builder', t('scheduled_jobs.builder.mode_schedule')], ['cron', t('scheduled_jobs.builder.mode_cron')]] as [ScheduleMode, string][]).map(([key, label]) => (
                    <Chip key={key} label={label} selected={mode === key} onPress={() => onModeChange(key)} style={{ flex: 1, alignItems: 'center', borderRadius: 6 }} />
                ))}
            </View>

            {mode === 'builder' ? (
                <View className="flex flex-col" style={{ gap: 18 }}>
                    <FieldLabel>{t('scheduled_jobs.builder.run')}</FieldLabel>
                    <ChipRow>
                        {FREQUENCIES.map((option) => (
                            <Chip key={option.value} label={t(option.label)} selected={state.frequency === option.value} onPress={() => update({ frequency: option.value })} />
                        ))}
                    </ChipRow>

                    {state.frequency === 'minute' && (
                        <>
                            <FieldLabel>{t('scheduled_jobs.builder.every')}</FieldLabel>
                            <ChipRow>
                                {MINUTE_INTERVALS.map((n) => (
                                    <Chip key={n} label={t('scheduled_jobs.builder.minutes_chip', { minutes: n })} selected={state.minuteInterval === n} onPress={() => update({ minuteInterval: n })} />
                                ))}
                            </ChipRow>
                        </>
                    )}

                    {state.frequency === 'hour' && (
                        <>
                            <FieldLabel>{t('scheduled_jobs.builder.at_minute')}</FieldLabel>
                            <ScrollChipRow
                                items={MINUTE_STEPS.map((m) => ({ key: m, label: `:${String(m).padStart(2, '0')}` }))}
                                selectedKey={state.hourMinuteOffset}
                                onSelect={(m) => update({ hourMinuteOffset: m })}
                            />
                        </>
                    )}

                    {state.frequency === 'week' && (
                        <>
                            <FieldLabel>{t('scheduled_jobs.builder.on')}</FieldLabel>
                            <ChipRow>
                                {WEEKDAY_SHORT.map((label, day) => {
                                    const selected = state.weekdays.includes(day);
                                    return (
                                        <Chip
                                            key={label}
                                            label={t(label)}
                                            selected={selected}
                                            onPress={() => {
                                                const next = selected ? state.weekdays.filter((d) => d !== day) : [...state.weekdays, day];
                                                update({ weekdays: next.length ? next : [day] }); // keep at least one day
                                            }}
                                        />
                                    );
                                })}
                            </ChipRow>
                        </>
                    )}

                    {state.frequency === 'month' && (
                        <>
                            <FieldLabel>{t('scheduled_jobs.builder.on_day')}</FieldLabel>
                            <ScrollChipRow
                                items={DAYS_OF_MONTH.map((d) => ({ key: d, label: String(d) }))}
                                selectedKey={state.dayOfMonth}
                                onSelect={(d) => update({ dayOfMonth: d })}
                            />
                            {state.dayOfMonth > 28 && (
                                <Text style={{ color: JOB_COLORS.muted }} className="text-xs">{t('scheduled_jobs.builder.days_skipped', { day: state.dayOfMonth })}</Text>
                            )}
                        </>
                    )}

                    {showsTime && (
                        <>
                            <FieldLabel>{t('scheduled_jobs.builder.at_time', { time: formatTimeOfDay(state.hour, state.minute) })}</FieldLabel>
                            <ScrollChipRow
                                items={HOURS.map((h) => ({ key: h, label: formatHourOfDay(h) }))}
                                selectedKey={state.hour}
                                onSelect={(h) => update({ hour: h })}
                            />
                            <ScrollChipRow
                                items={MINUTE_STEPS.map((m) => ({ key: m, label: `:${String(m).padStart(2, '0')}` }))}
                                selectedKey={MINUTE_STEPS.includes(state.minute) ? state.minute : -1}
                                onSelect={(m) => update({ minute: m })}
                            />
                            {!MINUTE_STEPS.includes(state.minute) && (
                                <Text style={{ color: JOB_COLORS.muted }} className="text-xs">{t('scheduled_jobs.builder.custom_minute', { minute: String(state.minute).padStart(2, '0') })}</Text>
                            )}
                        </>
                    )}
                </View>
            ) : (
                <View className="flex flex-col" style={{ gap: 8 }}>
                    <TextInput
                        value={value}
                        onChangeText={onChange}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="0 9 * * 1-5"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        style={{ backgroundColor: JOB_COLORS.row, padding: 14, fontFamily: 'monospace', borderWidth: 1, borderColor: valid ? 'transparent' : JOB_COLORS.danger }}
                        className="rounded-lg text-white text-base"
                    />
                    <Text style={{ color: JOB_COLORS.muted }} className="text-xs">
                        {t('scheduled_jobs.builder.cron_help')}
                    </Text>
                </View>
            )}

            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, gap: 2 }}>
                <Text style={{ color: valid ? JOB_COLORS.text : JOB_COLORS.danger }} className="text-sm font-medium">
                    {valid ? describeCron(value) : t('scheduled_jobs.builder.invalid_cron')}
                </Text>
                <Text style={{ color: JOB_COLORS.muted, fontFamily: 'monospace' }} className="text-xs">{value}</Text>
            </View>
        </View>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={{ color: JOB_COLORS.muted, marginBottom: -8 }} className="text-sm">{children}</Text>;
}

function ChipRow({ children }: { children: React.ReactNode }) {
    return <View className="flex flex-row flex-wrap" style={{ gap: 8 }}>{children}</View>;
}

/** Horizontal strip of chips that scrolls the selected one into view on mount */
function ScrollChipRow<T extends number>({ items, selectedKey, onSelect }: { items: { key: T; label: string }[]; selectedKey: T | -1; onSelect: (key: T) => void }) {
    const scrollRef = useRef<ScrollView>(null);
    const CHIP_WIDTH = 74;
    useEffect(() => {
        const index = items.findIndex((item) => item.key === selectedKey);
        if (index < 0) return;
        const timer = setTimeout(() => scrollRef.current?.scrollTo({ x: Math.max(0, (index - 1) * CHIP_WIDTH), animated: false }), 0);
        return () => clearTimeout(timer);
    }, []);
    return (
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -4 }}>
            {items.map((item) => (
                <Chip key={String(item.key)} label={item.label} selected={item.key === selectedKey} onPress={() => onSelect(item.key)} style={{ minWidth: CHIP_WIDTH - 8, alignItems: 'center' }} />
            ))}
        </ScrollView>
    );
}
