import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { CalendarCheck, CaretRight } from "phosphor-react-native";
import { type IAgentAction, type IScheduledJobCreatedAction } from "@/database/models/WorkspaceChat";
import { describeCron } from "@/utils/ScheduledJobs/cron";
import { navigateWhenReady } from "@/utils/navigationRef";
import { PATHS } from "@/utils/paths";

/**
 * Native port of the desktop `ScheduledJobCreatedCard`: one card per job the assistant created
 * in this turn (persisted as a `scheduled_job_created` action). Tapping opens the job's run
 * history in the Scheduled Jobs screen.
 */
export default memo(function ScheduledJobCreatedCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    // Like file cards, wait for the reply to finish so streaming text does not keep pushing the card around.
    if (isLoading) return null;
    const jobs = actions.filter((action): action is IScheduledJobCreatedAction => action.type === 'scheduled_job_created');
    if (jobs.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {jobs.map((action, index) => <ScheduledJobCreatedCard key={`${action.action.jobUuid}-${index}`} action={action} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 - same surface as the file download card */
    card: '#27272A',
    iconChip: '#3F3F46',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    accent: '#84CAFF',
} as const;

function ScheduledJobCreatedCard({ action }: { action: IScheduledJobCreatedAction }) {
    const { jobUuid, jobName, schedule } = action.action;
    const open = () => navigateWhenReady(PATHS.scheduled_jobs, { jobUuid });
    return (
        <TouchableOpacity
            onPress={open}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Open scheduled job ${jobName}`}
            style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 12, gap: 12, width: '100%' }}
            className="flex flex-row items-center">
            <View style={{ backgroundColor: COLORS.iconChip, width: 40, height: 40 }} className="flex items-center justify-center rounded-lg">
                <CalendarCheck size={22} color={COLORS.accent} />
            </View>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <Text numberOfLines={1} style={{ color: COLORS.text }} className="text-base font-medium">{jobName}</Text>
                <Text numberOfLines={1} style={{ color: COLORS.muted }} className="text-sm">Scheduled job · {describeCron(schedule)}</Text>
            </View>
            <View className="flex flex-row items-center" style={{ gap: 2 }}>
                <Text style={{ color: COLORS.accent }} className="text-sm font-medium">View</Text>
                <CaretRight size={14} color={COLORS.accent} />
            </View>
        </TouchableOpacity>
    );
}
