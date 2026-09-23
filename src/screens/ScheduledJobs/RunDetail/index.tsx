import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { CaretDown, CaretRight, Stop, Trash, Warning } from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import AwaitableAlert from '@/components/AwaitableAlert';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { database } from '@/database';
import ScheduledJob, { type ScheduledJobType } from '@/database/models/ScheduledJob';
import ScheduledJobRun, { type ScheduledJobRunType } from '@/database/models/ScheduledJobRun';
import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import ActivityChain from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/ActivityChain';
import TextResponseContainer from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/TextResponse';
import FileDownloadCards from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/FileDownloadCard';
import ActionsContainer from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/Actions';
import { formatDuration } from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/ActivityChain/utils';
import ScheduledJobRunner from '@/utils/ScheduledJobs/runner';
import { showToast } from '@/utils/Notification';
import { Card, JOB_COLORS, RunStatusLabel, ScreenHeader, SectionLabel, formatDateTime } from '../components';

/**
 * Everything one run produced. The stored result has the same shape as a chat reply, so the
 * activity chain, markdown body, generated-file cards and action chips are the chat history's
 * own components. Opening the run marks it read (clears the unseen dots).
 */
export default function RunDetail({ jobUuid, runUuid, onBack }: { jobUuid: string; runUuid: string; onBack: () => void }) {
    const insets = useSafeAreaInsets();
    const [job, setJob] = useState<ScheduledJobType | null>(null);
    const [run, setRun] = useState<ScheduledJobRunType | null>(null);
    const [loading, setLoading] = useState(true);
    const [promptOpen, setPromptOpen] = useState(false);
    const [stopping, setStopping] = useState(false);
    /** Set once the user deletes this run from here, so the row vanishing is not reported as "no longer exists" */
    const deletedHere = useRef(false);
    useHighjackBackButtonPress(() => { onBack(); return true; });

    useEffect(() => {
        ScheduledJob.findByUuid(jobUuid).then(setJob);
    }, [jobUuid]);

    // Observe the row so an in-flight run updates live and lands on its final state without polling.
    useEffect(() => {
        const subscription = database.get(ScheduledJobRun.table).query(Q.where('uuid', runUuid))
            .observeWithColumns(['status', 'result', 'error', 'completed_at'])
            .subscribe({
                next: (rows) => {
                    if (!rows.length) {
                        if (deletedHere.current) return; // onBack already fired from remove()
                        showToast('That run no longer exists');
                        return onBack();
                    }
                    setRun(ScheduledJobRun.toRunObject(rows[0]));
                    setLoading(false);
                },
                error: (error) => console.log('[RunDetail] observe failed', error),
            });
        return () => subscription.unsubscribe();
    }, [runUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    // Seen: clear the unread marker once the run has settled (an in-flight run is marked when it finishes on screen).
    useEffect(() => {
        if (!run || run.readAt || !ScheduledJobRun.isTerminal(run.status)) return;
        ScheduledJobRun.markRead(run.uuid);
    }, [run?.uuid, run?.status, run?.readAt]); // eslint-disable-line react-hooks/exhaustive-deps

    const chat = useMemo<DynamicChatMessage | null>(() => {
        if (!run) return null;
        const terminal = ScheduledJobRun.isTerminal(run.status);
        const failedWithoutReply = run.status !== 'completed' && !run.result?.textResponse;
        return {
            uuid: run.uuid,
            prompt: job?.prompt ?? '',
            response: run.result ?? undefined,
            createdAt: run.startedAt,
            isLoading: !terminal,
            type: failedWithoutReply ? 'error' : 'message',
        };
    }, [run, job?.prompt]);

    const remove = async () => {
        if (!run) return;
        const confirmed = await AwaitableAlert(
            'Delete this run?',
            'The result and any files it created will be removed.',
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive' },
        );
        if (!confirmed) return;
        deletedHere.current = true;
        await ScheduledJobRun.deleteByUuid(run.uuid);
        showToast('Run deleted');
        onBack();
    };

    const stop = async () => {
        if (!run || ScheduledJobRun.isTerminal(run.status)) return;
        setStopping(true);
        try {
            const stopped = await ScheduledJobRunner.cancelRun(run.uuid);
            if (!stopped) showToast('That run had already finished');
        } catch (error: any) {
            showToast(error?.message || 'Could not stop the run');
        } finally {
            setStopping(false);
        }
    };

    const duration = run?.completedAt ? formatDuration((run.completedAt - run.startedAt) / 1000) : null;
    const hasResult = !!run?.result && (!!run.result.textResponse || !!run.result.activity?.length || !!run.result.actions?.length);

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}>
            <ScreenHeader
                title={job?.name ?? 'Run'}
                subtitle={run ? formatDateTime(run.startedAt) : undefined}
                onBack={onBack}
                right={!run ? undefined : ScheduledJobRun.isTerminal(run.status) ? (
                    <TouchableOpacity onPress={remove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete run">
                        <Trash size={22} color={JOB_COLORS.danger} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={stop} disabled={stopping} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Stop run">
                        {stopping ? <ActivityIndicator size="small" color={JOB_COLORS.danger} /> : <Stop size={22} color={JOB_COLORS.danger} weight="fill" />}
                    </TouchableOpacity>
                )}
            />
            {loading || !run || !chat ? (
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#FFF" /></View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
                    {/* Status strip */}
                    <Card style={{ gap: 10 }}>
                        <View className="flex flex-row items-center justify-between">
                            <RunStatusLabel status={run.status} size="md" />
                            <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                                {run.trigger === 'manual' ? 'Run manually' : 'Scheduled'}{duration ? ` · ${duration}` : ''}
                            </Text>
                        </View>
                        {!!run.error && (
                            <View className="flex flex-row items-start" style={{ gap: 8, backgroundColor: JOB_COLORS.dangerBackground, borderRadius: 8, padding: 12 }}>
                                <Warning size={18} color={JOB_COLORS.danger} />
                                <Text style={{ color: JOB_COLORS.danger, flex: 1 }} className="text-sm">{run.error}</Text>
                            </View>
                        )}
                        {!!run.result?.metrics?.total_tokens && (
                            <Text style={{ color: JOB_COLORS.muted }} className="text-xs">
                                {run.result.metrics.prompt_tokens.toLocaleString()} prompt · {run.result.metrics.completion_tokens.toLocaleString()} completion tokens
                            </Text>
                        )}
                    </Card>

                    {/* Prompt (collapsed) */}
                    {!!job?.prompt && (
                        <TouchableOpacity onPress={() => setPromptOpen((open) => !open)} activeOpacity={0.7}>
                            <Card style={{ gap: 8 }}>
                                <View className="flex flex-row items-center justify-between">
                                    <Text style={{ color: JOB_COLORS.muted }} className="text-sm uppercase">Prompt</Text>
                                    {promptOpen ? <CaretDown size={16} color={JOB_COLORS.muted} /> : <CaretRight size={16} color={JOB_COLORS.muted} />}
                                </View>
                                <Text className="text-white text-base" numberOfLines={promptOpen ? undefined : 2}>{job.prompt}</Text>
                            </Card>
                        </TouchableOpacity>
                    )}

                    {/* Result - rendered with the chat history's assistant components */}
                    <View className="flex flex-col" style={{ gap: 12 }}>
                        <SectionLabel>Result</SectionLabel>
                        {!hasResult && ScheduledJobRun.isTerminal(run.status) ? (
                            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
                                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center' }} className="text-sm">
                                    {run.status === 'completed' ? 'The model finished without writing anything.' : 'Nothing was produced before the run stopped.'}
                                </Text>
                            </Card>
                        ) : (
                            <View className="flex flex-col items-start w-full" style={{ gap: 11, paddingHorizontal: 4 }}>
                                <ActivityChain chat={chat} />
                                {!ScheduledJobRun.isTerminal(run.status) && !chat.response?.textResponse && (
                                    <View className="flex flex-row items-center" style={{ gap: 8 }}>
                                        <ActivityIndicator size="small" color={JOB_COLORS.accent} />
                                        <Text style={{ color: JOB_COLORS.muted }} className="text-sm">{stopping ? 'Stopping…' : 'Working on it…'}</Text>
                                    </View>
                                )}
                                <TextResponseContainer uuid={run.uuid} textResponse={chat.response?.textResponse} metrics={chat.response?.metrics} />
                                <FileDownloadCards actions={chat.response?.actions} isLoading={chat.isLoading} />
                                <ActionsContainer actions={chat.response?.actions} />
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}
        </SafeView>
    );
}
