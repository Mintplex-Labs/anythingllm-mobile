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
    formatTimeOfDay,
    isValidCron,
} from '@/utils/ScheduledJobs/cron';
import { Chip, JOB_COLORS } from '../components';

export type ScheduleMode = 'builder' | 'cron';

const FREQUENCIES: { value: BuilderFrequency; label: string }[] = [
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'hour', label: 'Hourly' },
    { value: 'minute', label: 'Every few minutes' },
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
    const [state, setState] = useState<BuilderState>(() => cronToBuilderState(value).state);

    // Switching to the builder from a cron the builder can show keeps its settings; otherwise start from the defaults.
    useEffect(() => {
        if (mode !== 'builder') return;
        const parsed = cronToBuilderState(value);
        setState(parsed.state);
        if (!parsed.matched) onChange(builderStateToCron(parsed.state));
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
                {([['builder', 'Schedule'], ['cron', 'Cron expression']] as [ScheduleMode, string][]).map(([key, label]) => (
                    <Chip key={key} label={label} selected={mode === key} onPress={() => onModeChange(key)} style={{ flex: 1, alignItems: 'center', borderRadius: 6 }} />
                ))}
            </View>

            {mode === 'builder' ? (
                <View className="flex flex-col" style={{ gap: 18 }}>
                    <FieldLabel>Run</FieldLabel>
                    <ChipRow>
                        {FREQUENCIES.map((option) => (
                            <Chip key={option.value} label={option.label} selected={state.frequency === option.value} onPress={() => update({ frequency: option.value })} />
                        ))}
                    </ChipRow>

                    {state.frequency === 'minute' && (
                        <>
                            <FieldLabel>Every</FieldLabel>
                            <ChipRow>
                                {MINUTE_INTERVALS.map((n) => (
                                    <Chip key={n} label={`${n} min`} selected={state.minuteInterval === n} onPress={() => update({ minuteInterval: n })} />
                                ))}
                            </ChipRow>
                        </>
                    )}

                    {state.frequency === 'hour' && (
                        <>
                            <FieldLabel>At minute</FieldLabel>
                            <ScrollChipRow
                                items={MINUTE_STEPS.map((m) => ({ key: m, label: `:${String(m).padStart(2, '0')}` }))}
                                selectedKey={state.hourMinuteOffset}
                                onSelect={(m) => update({ hourMinuteOffset: m })}
                            />
                        </>
                    )}

                    {state.frequency === 'week' && (
                        <>
                            <FieldLabel>On</FieldLabel>
                            <ChipRow>
                                {WEEKDAY_SHORT.map((label, day) => {
                                    const selected = state.weekdays.includes(day);
                                    return (
                                        <Chip
                                            key={label}
                                            label={label}
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
                            <FieldLabel>On day</FieldLabel>
                            <ScrollChipRow
                                items={DAYS_OF_MONTH.map((d) => ({ key: d, label: String(d) }))}
                                selectedKey={state.dayOfMonth}
                                onSelect={(d) => update({ dayOfMonth: d })}
                            />
                            {state.dayOfMonth > 28 && (
                                <Text style={{ color: JOB_COLORS.muted }} className="text-xs">Months without a day {state.dayOfMonth} are skipped.</Text>
                            )}
                        </>
                    )}

                    {showsTime && (
                        <>
                            <FieldLabel>At {formatTimeOfDay(state.hour, state.minute)}</FieldLabel>
                            <ScrollChipRow
                                items={HOURS.map((h) => ({ key: h, label: formatTimeOfDay(h, 0).replace(':00', '') }))}
                                selectedKey={state.hour}
                                onSelect={(h) => update({ hour: h })}
                            />
                            <ScrollChipRow
                                items={MINUTE_STEPS.map((m) => ({ key: m, label: `:${String(m).padStart(2, '0')}` }))}
                                selectedKey={MINUTE_STEPS.includes(state.minute) ? state.minute : -1}
                                onSelect={(m) => update({ minute: m })}
                            />
                            {!MINUTE_STEPS.includes(state.minute) && (
                                <Text style={{ color: JOB_COLORS.muted }} className="text-xs">Minute :{String(state.minute).padStart(2, '0')} was set with a cron expression - pick a step above to change it.</Text>
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
                        Five fields: minute, hour, day of month, month, day of week (0 = Sunday). Times are in your phone's time zone.
                    </Text>
                </View>
            )}

            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, gap: 2 }}>
                <Text style={{ color: valid ? JOB_COLORS.text : JOB_COLORS.danger }} className="text-sm font-medium">
                    {valid ? describeCron(value) : 'This is not a valid cron expression'}
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -4 }}>
            {items.map((item) => (
                <Chip key={String(item.key)} label={item.label} selected={item.key === selectedKey} onPress={() => onSelect(item.key)} style={{ minWidth: CHIP_WIDTH - 8, alignItems: 'center' }} />
            ))}
        </ScrollView>
    );
}
