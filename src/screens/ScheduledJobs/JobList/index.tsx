import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ClockCountdown, CaretRight, Plus } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import useTableChanges from '@/hooks/useTableChanges';
import ScheduledJob, { type ScheduledJobType } from '@/database/models/ScheduledJob';
import ScheduledJobRun, { type ScheduledJobRunType } from '@/database/models/ScheduledJobRun';
import { describeCron } from '@/utils/ScheduledJobs/cron';
import { syncNativeSchedule, supportsBackgroundRuns } from '@/utils/ScheduledJobs/scheduler';
import { showToast } from '@/utils/Notification';
import uiStore from '@/store/UIStore';
import { PATHS } from '@/utils/paths';
import { ActionButton, Card, JOB_COLORS, NoticeBanner, RunStatusLabel, ScreenHeader, SectionLabel, UnreadDot, formatRelativeTime } from '../components';
import useJobsBlockedReason, { BLOCKED_COPY } from '../useJobsBlockedReason';

type JobRow = ScheduledJobType & { latestRun: ScheduledJobRunType | null; unread: number };

export default function JobList({ onBack, onCreate, onOpenJob }: { onBack: () => void; onCreate: () => void; onOpenJob: (jobUuid: string) => void }) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { blocked } = useJobsBlockedReason();
    const [jobs, setJobs] = useState<JobRow[]>([]);
    const [loading, setLoading] = useState(true);
    useHighjackBackButtonPress(() => { onBack(); return true; });

    const load = useCallback(async () => {
        try {
            const all = await ScheduledJob.find();
            const rows = await Promise.all(all.map(async (job) => ({
                ...job,
                latestRun: await ScheduledJobRun.latestForJob(job.uuid),
                unread: await ScheduledJobRun.unreadCount(job.uuid),
            })));
            setJobs(rows);
        } catch (error) {
            console.error('[ScheduledJobs] failed to load jobs', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useTableChanges([ScheduledJob.table, ScheduledJobRun.table], load);

    const toggleEnabled = async (job: JobRow) => {
        // Optimistic flip so the switch animates right away
        setJobs((current) => current.map((row) => (row.uuid === job.uuid ? { ...row, enabled: !row.enabled } : row)));
        try {
            await ScheduledJob.setEnabled(job.uuid, !job.enabled);
            await syncNativeSchedule();
        } catch (error: any) {
            showToast(error?.message || 'Could not update the job');
            load();
        }
    };

    const goToSettings = () => {
        uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, { path: PATHS.user_settings });
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.user_settings }],
        });
    };

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}>
            <ScreenHeader title="Scheduled Jobs" onBack={onBack} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20, gap: 24, flexGrow: 1 }}>
                {blocked && (
                    <NoticeBanner
                        title={BLOCKED_COPY[blocked].title}
                        body={BLOCKED_COPY[blocked].body}
                        action={{ label: 'Open LLM settings', onPress: goToSettings }}
                    />
                )}

                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <SectionLabel trailing={!!jobs.length && <Text style={{ color: JOB_COLORS.muted }} className="text-sm">{jobs.filter((j) => j.enabled).length} of {jobs.length} on</Text>}>
                        Your jobs
                    </SectionLabel>
                    {loading ? (
                        <View className="w-full items-center" style={{ paddingVertical: 40 }}>
                            <ActivityIndicator size="large" color="#FFF" />
                        </View>
                    ) : jobs.length === 0 ? (
                        <EmptyState blocked={!!blocked} onCreate={onCreate} />
                    ) : (
                        <Card style={{ gap: 0, paddingVertical: 4 }}>
                            {jobs.map((job, index) => (
                                <JobListRow
                                    key={job.uuid}
                                    job={job}
                                    last={index === jobs.length - 1}
                                    paused={!!blocked}
                                    onPress={() => onOpenJob(job.uuid)}
                                    onToggle={() => toggleEnabled(job)}
                                />
                            ))}
                        </Card>
                    )}
                    <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                        A job is a prompt the assistant runs for you on a schedule, using the tools you pick for it. Results collect here
                        {supportsBackgroundRuns() ? ' and run even while the app is closed - Android may delay a run by a few minutes to save battery.' : ' the next time you open the app.'}
                    </Text>
                </View>
            </ScrollView>

            {(jobs.length > 0 || loading) && (
                <View style={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
                    <ActionButton title="New job" icon={<Plus size={20} color="#0E0F0F" weight="bold" />} onPress={onCreate} disabled={!!blocked} />
                </View>
            )}
        </SafeView>
    );
}

function JobListRow({ job, last, paused, onPress, onToggle }: { job: JobRow; last: boolean; paused: boolean; onPress: () => void; onToggle: () => void }) {
    const inFlight = job.latestRun?.status === 'running' || job.latestRun?.status === 'queued';
    let statusLine: string;
    if (inFlight) statusLine = 'Running now';
    else if (!job.enabled) statusLine = 'Paused';
    else if (paused) statusLine = 'Waiting for a cloud LLM';
    else if (job.nextRunAt) statusLine = `Next run ${formatRelativeTime(job.nextRunAt)}`;
    else statusLine = 'Not scheduled';

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="flex flex-row items-center"
            style={{ gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: JOB_COLORS.row }}>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <View className="flex flex-row items-center" style={{ gap: 8 }}>
                    {job.unread > 0 && <UnreadDot />}
                    <Text numberOfLines={1} style={{ color: job.enabled ? JOB_COLORS.text : JOB_COLORS.muted, flexShrink: 1 }} className="text-lg font-medium">{job.name}</Text>
                </View>
                <Text numberOfLines={1} style={{ color: JOB_COLORS.muted }} className="text-sm">{describeCron(job.schedule)}</Text>
                <View className="flex flex-row items-center" style={{ gap: 6 }}>
                    {job.latestRun && !inFlight && <RunStatusLabel status={job.latestRun.status} />}
                    {job.latestRun && !inFlight && <Text style={{ color: JOB_COLORS.muted }} className="text-sm">·</Text>}
                    <Text style={{ color: inFlight ? JOB_COLORS.accent : JOB_COLORS.muted }} className="text-sm">{statusLine}</Text>
                </View>
            </View>
            <ToggleSwitch isOn={job.enabled} onToggle={onToggle} />
            <CaretRight size={18} color={JOB_COLORS.muted} />
        </TouchableOpacity>
    );
}

function EmptyState({ blocked, onCreate }: { blocked: boolean; onCreate: () => void }) {
    return (
        <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 16 }}>
            <View style={{ backgroundColor: JOB_COLORS.chip, width: 64, height: 64 }} className="flex items-center justify-center rounded-full">
                <ClockCountdown size={32} color="#FFF" />
            </View>
            <View className="flex flex-col items-center" style={{ gap: 6 }}>
                <Text className="text-white text-lg font-medium">No scheduled jobs yet</Text>
                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center', paddingHorizontal: 12 }} className="text-sm">
                    Have the assistant check a website every morning, draft a weekly summary, or build a report on the first of the month - all without opening a chat.
                </Text>
            </View>
            <View style={{ width: '100%' }}>
                <ActionButton title="Create your first job" icon={<Plus size={20} color="#0E0F0F" weight="bold" />} onPress={onCreate} disabled={blocked} />
            </View>
        </Card>
    );
}
