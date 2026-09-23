import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRight, PencilSimple, Play, Stop } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import ToggleSwitch from '@/components/ToggleSwitch';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import useTableChanges from '@/hooks/useTableChanges';
import ScheduledJob, { type ScheduledJobType } from '@/database/models/ScheduledJob';
import ScheduledJobRun, { type ScheduledJobRunType } from '@/database/models/ScheduledJobRun';
import { describeCron } from '@/utils/ScheduledJobs/cron';
import ScheduledJobRunner from '@/utils/ScheduledJobs/runner';
import { syncNativeSchedule } from '@/utils/ScheduledJobs/scheduler';
import { formatDuration } from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/ActivityChain/utils';
import { showToast } from '@/utils/Notification';
import { ActionButton, Card, JOB_COLORS, NoticeBanner, RunStatusLabel, ScreenHeader, SectionLabel, UnreadDot, formatDateTime, formatRelativeTime } from '../components';
import useJobsBlockedReason, { BLOCKED_COPY } from '../useJobsBlockedReason';

/** One job: its schedule, controls and the history of its runs */
export default function JobRuns({ jobUuid, onBack, onEdit, onOpenRun }: { jobUuid: string; onBack: () => void; onEdit: () => void; onOpenRun: (runUuid: string) => void }) {
    const insets = useSafeAreaInsets();
    const { blocked } = useJobsBlockedReason();
    const [job, setJob] = useState<ScheduledJobType | null>(null);
    const [runs, setRuns] = useState<ScheduledJobRunType[]>([]);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    useHighjackBackButtonPress(() => { onBack(); return true; });

    const load = useCallback(async () => {
        const [nextJob, nextRuns] = await Promise.all([ScheduledJob.findByUuid(jobUuid), ScheduledJobRun.forJob(jobUuid)]);
        if (!nextJob) {
            showToast('That job no longer exists');
            return onBack();
        }
        setJob(nextJob);
        setRuns(nextRuns);
        setLoading(false);
    }, [jobUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);
    useTableChanges([ScheduledJob.table, ScheduledJobRun.table], load);

    const inFlightRun = runs.find((run) => run.status === 'running' || run.status === 'queued') ?? null;
    const inFlight = !!inFlightRun;

    const runNow = async () => {
        if (!job) return;
        setStarting(true);
        // Kick it off and let the table observer show progress - the run can take minutes.
        ScheduledJobRunner.runJobNow(job.uuid)
            .then((outcome) => {
                if (outcome.blocked) showToast(BLOCKED_COPY[outcome.blocked].title, 'long');
                else if (outcome.inFlight) showToast('This job is already running');
            })
            .catch((error) => showToast(error?.message || 'Could not start the job'))
            .finally(() => syncNativeSchedule());
        setTimeout(() => setStarting(false), 800);
    };

    const stopRun = async () => {
        if (!inFlightRun) return;
        setStopping(true);
        try {
            const stopped = await ScheduledJobRunner.cancelRun(inFlightRun.uuid);
            if (!stopped) showToast('That run had already finished');
        } catch (error: any) {
            showToast(error?.message || 'Could not stop the run');
        } finally {
            setStopping(false);
        }
    };

    const toggleEnabled = async () => {
        if (!job) return;
        setJob({ ...job, enabled: !job.enabled });
        try {
            await ScheduledJob.setEnabled(job.uuid, !job.enabled);
            await syncNativeSchedule();
        } catch (error: any) {
            showToast(error?.message || 'Could not update the job');
            load();
        }
    };

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}>
            <ScreenHeader
                title={job?.name ?? 'Job'}
                subtitle={job ? describeCron(job.schedule) : undefined}
                onBack={onBack}
                right={(
                    <TouchableOpacity onPress={onEdit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Edit job">
                        <PencilSimple size={22} color="#FFF" />
                    </TouchableOpacity>
                )}
            />
            {loading || !job ? (
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#FFF" /></View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 24 }}>
                    {blocked && <NoticeBanner title={BLOCKED_COPY[blocked].title} body={BLOCKED_COPY[blocked].body} />}

                    {/* Summary + controls */}
                    <Card style={{ gap: 14 }}>
                        <View className="flex flex-row items-center justify-between">
                            <View className="flex flex-col" style={{ flex: 1, paddingRight: 12 }}>
                                <Text className="text-white text-[14px] font-semibold">{job.enabled ? 'Enabled' : 'Paused'}</Text>
                                <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                                    {inFlight ? 'Running now' : job.enabled && job.nextRunAt ? `Next run ${formatRelativeTime(job.nextRunAt)} · ${formatDateTime(job.nextRunAt)}` : 'Not scheduled to run'}
                                </Text>
                            </View>
                            <ToggleSwitch isOn={job.enabled} onToggle={toggleEnabled} />
                        </View>
                        <View style={{ height: 1, backgroundColor: JOB_COLORS.row }} />
                        <View className="flex flex-col" style={{ gap: 6 }}>
                            <Text style={{ color: JOB_COLORS.muted }} className="text-sm uppercase">Prompt</Text>
                            <Text className="text-white text-base" numberOfLines={6}>{job.prompt}</Text>
                        </View>
                        <View className="flex flex-row" style={{ gap: 16 }}>
                            <Meta label="Tools" value={job.tools.length ? String(job.tools.length) : 'None'} />
                            <Meta label="Notify" value={job.notifyOnComplete ? 'On' : 'Off'} />
                            <Meta label="Last run" value={job.lastRunAt ? formatRelativeTime(job.lastRunAt) : 'Never'} />
                        </View>
                        {inFlight ? (
                            <ActionButton
                                title="Stop run"
                                tone="danger"
                                icon={<Stop size={18} color={JOB_COLORS.danger} weight="fill" />}
                                onPress={stopRun}
                                loading={stopping}
                            />
                        ) : (
                            <ActionButton
                                title="Run now"
                                tone="secondary"
                                icon={<Play size={18} color="#FFF" weight="fill" />}
                                onPress={runNow}
                                loading={starting}
                                disabled={!!blocked}
                            />
                        )}
                    </Card>

                    {/* Runs */}
                    <View className="flex flex-col" style={{ gap: 12 }}>
                        <SectionLabel trailing={!!runs.length && <Text style={{ color: JOB_COLORS.muted }} className="text-sm">{runs.length} run{runs.length === 1 ? '' : 's'}</Text>}>
                            History
                        </SectionLabel>
                        {runs.length === 0 ? (
                            <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
                                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center' }} className="text-sm">
                                    This job has not run yet. {job.enabled && job.nextRunAt ? `Its first run is ${formatRelativeTime(job.nextRunAt)}.` : ''} You can also run it now to try it out.
                                </Text>
                            </Card>
                        ) : (
                            <Card style={{ gap: 0, paddingVertical: 4 }}>
                                {runs.map((run, index) => <RunRow key={run.uuid} run={run} last={index === runs.length - 1} onPress={() => onOpenRun(run.uuid)} />)}
                            </Card>
                        )}
                    </View>
                </ScrollView>
            )}
        </SafeView>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <View className="flex flex-col">
            <Text style={{ color: JOB_COLORS.muted }} className="text-xs uppercase">{label}</Text>
            <Text className="text-white text-sm font-medium">{value}</Text>
        </View>
    );
}

function runDurationLabel(run: ScheduledJobRunType): string {
    if (!run.completedAt) return '';
    return formatDuration((run.completedAt - run.startedAt) / 1000);
}

function RunRow({ run, last, onPress }: { run: ScheduledJobRunType; last: boolean; onPress: () => void }) {
    const terminal = ScheduledJobRun.isTerminal(run.status);
    const unread = terminal && !run.readAt;
    const preview = run.error || run.result?.textResponse?.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim() || '';
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="flex flex-row items-center"
            style={{ gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: JOB_COLORS.row }}>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <View className="flex flex-row items-center" style={{ gap: 8 }}>
                    {unread && <UnreadDot />}
                    <RunStatusLabel status={run.status} size="md" />
                    {run.trigger === 'manual' && <Text style={{ color: JOB_COLORS.muted }} className="text-xs">· manual</Text>}
                </View>
                <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                    {formatDateTime(run.startedAt)}{runDurationLabel(run) ? ` · ${runDurationLabel(run)}` : ''}
                </Text>
                {!!preview && (
                    <Text numberOfLines={2} style={{ color: run.error ? JOB_COLORS.danger : JOB_COLORS.text, opacity: run.error ? 1 : 0.85 }} className="text-sm">{preview}</Text>
                )}
            </View>
            <CaretRight size={18} color={JOB_COLORS.muted} />
        </TouchableOpacity>
    );
}
