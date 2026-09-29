import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
                showToast(t('scheduled_jobs.job_missing'));
                return onCancel();
            }
            setForm({ name: job.name, prompt: job.prompt, tools: job.tools, schedule: job.schedule, enabled: job.enabled, notifyOnComplete: job.notifyOnComplete });
            // A schedule the builder cannot express opens in cron mode so nothing is silently rewritten
            setScheduleMode(cronToBuilderState(job.schedule).matched ? 'builder' : 'cron');
            setLoading(false);
        });
    }, [jobUuid]);

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
            if (!saved) throw new Error(t('scheduled_jobs.form.save_failed'));
            await syncNativeSchedule();
            if (!editing) Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.SCHEDULED_JOB_CREATED, { tools: form.tools.length, notify: form.notifyOnComplete });
            showToast(editing ? t('scheduled_jobs.form.job_updated') : t('scheduled_jobs.form.job_scheduled'));
            onDone(saved.uuid);
        } catch (error: any) {
            showToast(error?.message || t('scheduled_jobs.form.could_not_save'), 'long');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!jobUuid) return;
        const confirmed = await AwaitableAlert(
            t('scheduled_jobs.form.delete_title'),
            t('scheduled_jobs.form.delete_message', { name: form.name }),
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive' },
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await ScheduledJob.delete(jobUuid);
            await syncNativeSchedule();
            showToast(t('scheduled_jobs.form.job_deleted'));
            onDone(undefined);
        } catch (error: any) {
            showToast(error?.message || t('scheduled_jobs.form.delete_failed'));
            setDeleting(false);
        }
    };

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}>
            <ScreenHeader title={editing ? t('scheduled_jobs.form.edit_title') : t('scheduled_jobs.form.new_title')} onBack={onCancel} />
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
                            <SectionLabel>{t('scheduled_jobs.form.what_section')}</SectionLabel>
                            <Card style={{ gap: 12 }}>
                                <Field label={t('scheduled_jobs.form.name')}>
                                    <TextInput
                                        value={form.name}
                                        onChangeText={(name) => patch({ name })}
                                        placeholder={t('scheduled_jobs.form.name_placeholder')}
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        maxLength={ScheduledJob.maxNameLength}
                                        style={{ backgroundColor: JOB_COLORS.row, padding: 14 }}
                                        className="rounded-lg text-white text-base"
                                    />
                                </Field>
                                <Field label={t('scheduled_jobs.prompt')} hint={t('scheduled_jobs.form.prompt_hint')}>
                                    <TextInput
                                        value={form.prompt}
                                        onChangeText={(prompt) => patch({ prompt })}
                                        multiline
                                        numberOfLines={6}
                                        placeholder={t('scheduled_jobs.form.prompt_placeholder')}
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
                            <SectionLabel>{t('scheduled_jobs.form.when_section')}</SectionLabel>
                            <Card>
                                <ScheduleBuilder value={form.schedule} mode={scheduleMode} onChange={(schedule) => patch({ schedule })} onModeChange={setScheduleMode} />
                            </Card>
                        </View>

                        {/* Tools */}
                        <ToolPicker selected={form.tools} onChange={(tools) => patch({ tools })} />

                        {/* Options */}
                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <SectionLabel>{t('scheduled_jobs.form.options')}</SectionLabel>
                            <Card style={{ gap: 16 }}>
                                <OptionRow
                                    title={t('scheduled_jobs.form.notify_title')}
                                    description={t('scheduled_jobs.form.notify_description')}
                                    isOn={form.notifyOnComplete}
                                    onToggle={() => patch({ notifyOnComplete: !form.notifyOnComplete })}
                                />
                                <OptionRow
                                    title={t('common.enabled')}
                                    description={t('scheduled_jobs.form.enabled_description')}
                                    isOn={form.enabled}
                                    onToggle={() => patch({ enabled: !form.enabled })}
                                />
                            </Card>
                        </View>

                        <View className="flex flex-col" style={{ gap: 12 }}>
                            <ActionButton title={editing ? t('scheduled_jobs.form.save_changes') : t('scheduled_jobs.form.schedule_job')} onPress={save} loading={saving} disabled={!validation.valid || !scheduleValid || deleting} />
                            {!validation.valid && (form.name || form.prompt) ? (
                                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center' }} className="text-sm">{validation.error}</Text>
                            ) : null}
                            {editing && <ActionButton title={t('scheduled_jobs.form.delete_job')} tone="danger" onPress={remove} loading={deleting} disabled={saving} />}
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
