import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import AwaitableAlert from '@/components/AwaitableAlert';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import ScheduledJob, { type ScheduledJobWritable } from '@/database/models/ScheduledJob';
import { DEFAULT_CRON, cronToBuilderState, isValidCron } from '@/utils/ScheduledJobs/cron';
import { syncNativeSchedule } from '@/utils/ScheduledJobs/scheduler';
import { showToast } from '@/utils/Notification';
import PushNotifications from '@/utils/PushNotifications';
import Telemetry from '@/utils/Telemetry';
import { ActionButton, Card, JOB_COLORS, ScreenHeader, SectionLabel } from '../components';
import ScheduleBuilder, { type ScheduleMode } from './ScheduleBuilder';
import ToolPicker from './ToolPicker';

const EMPTY_FORM: ScheduledJobWritable = {
    name: '',
    prompt: '',
    tools: [],
    schedule: DEFAULT_CRON,
    enabled: true,
    notifyOnComplete: true,
};

/** Create a new job, or edit `jobUuid`. `onDone` receives the saved job's uuid (undefined after a delete). */
export default function JobForm({ jobUuid, onDone, onCancel }: { jobUuid?: string; onDone: (jobUuid?: string) => void; onCancel: () => void }) {
    const insets = useSafeAreaInsets();
    const editing = !!jobUuid;
    const [form, setForm] = useState<ScheduledJobWritable>(EMPTY_FORM);
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('builder');
    const [loading, setLoading] = useState(editing);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    useHighjackBackButtonPress(() => { onCancel(); return true; });

    useEffect(() => {
        if (!jobUuid) return;
        ScheduledJob.findByUuid(jobUuid).then((job) => {
            if (!job) {
                showToast('That job no longer exists');
                return onCancel();
            }
            setForm({ name: job.name, prompt: job.prompt, tools: job.tools, schedule: job.schedule, enabled: job.enabled, notifyOnComplete: job.notifyOnComplete });
            // A schedule the builder cannot express opens in cron mode so nothing is silently rewritten
            setScheduleMode(cronToBuilderState(job.schedule).matched ? 'builder' : 'cron');
            setLoading(false);
        });
    }, [jobUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    const patch = (updates: Partial<ScheduledJobWritable>) => setForm((current) => ({ ...current, ...updates }));
    const validation = ScheduledJob.validate(form);
    const scheduleValid = isValidCron(form.schedule);

    const save = async () => {
        if (!validation.valid) return showToast(validation.error);
        setSaving(true);
        try {
            // Notifications are the point of "notify me" - ask now if the user has never been asked.
            if (form.notifyOnComplete) await PushNotifications.requestPermissionIfUndecided();
            const saved = editing ? await ScheduledJob.update(jobUuid!, form) : await ScheduledJob.create(form);
            if (!saved) throw new Error('The job could not be saved');
            await syncNativeSchedule();
            if (!editing) Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_CREATED, { tools: form.tools.length, notify: form.notifyOnComplete });
            showToast(editing ? 'Job updated' : 'Job scheduled');
            onDone(saved.uuid);
        } catch (error: any) {
            showToast(error?.message || 'Could not save the job', 'long');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!jobUuid) return;
        const confirmed = await AwaitableAlert(
            'Delete this job?',
            `"${form.name}" and every result it produced will be removed. This cannot be undone.`,
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive' },
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await ScheduledJob.delete(jobUuid);
            await syncNativeSchedule();
            showToast('Job deleted');
            onDone(undefined);
        } catch (error: any) {
            showToast(error?.message || 'Could not delete the job');
            setDeleting(false);
        }
    };

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}>
            <ScreenHeader title={editing ? 'Edit Job' : 'New Job'} onBack={onCancel} />
            {loading ? (
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#FFF" /></View>
            ) : (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 24 }}>
                        {/* Name + prompt */}
                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <SectionLabel>What should it do?</SectionLabel>
                            <Card style={{ gap: 12 }}>
                                <Field label="Name">
                                    <TextInput
                                        value={form.name}
                                        onChangeText={(name) => patch({ name })}
                                        placeholder="Morning news digest"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        maxLength={ScheduledJob.maxNameLength}
                                        style={{ backgroundColor: JOB_COLORS.row, padding: 14 }}
                                        className="rounded-lg text-white text-base"
                                    />
                                </Field>
                                <Field label="Prompt" hint="Written as if you were sending it in a chat. Be specific - nobody is around to answer follow-up questions.">
                                    <TextInput
                                        value={form.prompt}
                                        onChangeText={(prompt) => patch({ prompt })}
                                        multiline
                                        numberOfLines={6}
                                        placeholder="Read https://news.ycombinator.com and write a short digest of the five most interesting stories, with a one-line take on each."
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        maxLength={ScheduledJob.maxPromptLength}
                                        style={{ backgroundColor: JOB_COLORS.row, padding: 14, minHeight: 140, textAlignVertical: 'top' }}
                                        className="rounded-lg text-white text-base"
                                    />
                                </Field>
                            </Card>
                        </View>

                        {/* Schedule */}
                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <SectionLabel>When should it run?</SectionLabel>
                            <Card>
                                <ScheduleBuilder value={form.schedule} mode={scheduleMode} onChange={(schedule) => patch({ schedule })} onModeChange={setScheduleMode} />
                            </Card>
                        </View>

                        {/* Tools */}
                        <ToolPicker selected={form.tools} onChange={(tools) => patch({ tools })} />

                        {/* Options */}
                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <SectionLabel>Options</SectionLabel>
                            <Card style={{ gap: 16 }}>
                                <OptionRow
                                    title="Notify me when it finishes"
                                    description="Sends a notification when a run completes with a result. Failed or empty runs only show a dot in the app."
                                    isOn={form.notifyOnComplete}
                                    onToggle={() => patch({ notifyOnComplete: !form.notifyOnComplete })}
                                />
                                <OptionRow
                                    title="Enabled"
                                    description="Turn off to keep the job and its results without running it."
                                    isOn={form.enabled}
                                    onToggle={() => patch({ enabled: !form.enabled })}
                                />
                            </Card>
                        </View>

                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <ActionButton title={editing ? 'Save changes' : 'Schedule job'} onPress={save} loading={saving} disabled={!validation.valid || !scheduleValid || deleting} />
                            {!validation.valid && (form.name || form.prompt) ? (
                                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center' }} className="text-sm">{validation.error}</Text>
                            ) : null}
                            {editing && <ActionButton title="Delete job" tone="danger" onPress={remove} loading={deleting} disabled={saving} />}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </SafeView>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <View className="flex flex-col" style={{ gap: 8 }}>
            <Text style={{ color: JOB_COLORS.muted }} className="text-sm">{label}</Text>
            {children}
            {!!hint && <Text style={{ color: JOB_COLORS.muted }} className="text-xs">{hint}</Text>}
        </View>
    );
}

function OptionRow({ title, description, isOn, onToggle }: { title: string; description: string; isOn: boolean; onToggle: () => void }) {
    return (
        <View className="flex w-full flex-row items-center justify-between">
            <View className="flex flex-col items-start" style={{ flex: 1, paddingRight: 12 }}>
                <Text className="text-white text-[14px] font-semibold">{title}</Text>
                <Text style={{ color: JOB_COLORS.muted, maxWidth: '95%' }} className="text-sm">{description}</Text>
            </View>
            <ToggleSwitch isOn={isOn} onToggle={onToggle} />
        </View>
    );
}
