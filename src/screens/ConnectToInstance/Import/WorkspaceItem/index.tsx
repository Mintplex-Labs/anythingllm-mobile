import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import { formatNumber } from "@/utils/formatters";
import { CheckCircle, WarningCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { syncFromRemote } from "./sync";
import { useTranslation } from "react-i18next";
import { JOB_COLORS } from "@/screens/ScheduledJobs/components";

type IStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface WorkspaceItemProps {
    module: AnythingLLMExternal;
    workspace: CommandResponses['workspaces']['workspaces'][number];
    /** Last row in the card - drops the divider */
    last: boolean;
}

export default function WorkspaceItem({ module, workspace, last }: WorkspaceItemProps) {
    const { t } = useTranslation();
    // The remote default thread is not imported - a workspace without threads gets one new thread.
    const importedThreadCount = Math.max(workspace.threadCount, 1);

    return (
        <View
            className="flex flex-row items-center"
            style={{ gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: JOB_COLORS.row }}>
            <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                <Text numberOfLines={1} ellipsizeMode="tail" className="text-white text-lg font-medium">{workspace.name}</Text>
                <Text numberOfLines={1} style={{ color: JOB_COLORS.muted }} className="text-sm">
                    {t('connect.import.thread_count', { count: importedThreadCount, formatted: formatNumber(importedThreadCount) })}
                    {' · '}
                    {t('connect.import.chat_count', { count: workspace.chatCount, formatted: formatNumber(workspace.chatCount) })}
                </Text>
            </View>
            <SyncButton module={module} workspace={workspace} />
        </View>
    );
}

/** Pill on the right of each row - fixed min width so the row does not shift between states */
function SyncButton({ module, workspace }: { module: AnythingLLMExternal, workspace: CommandResponses['workspaces']['workspaces'][number] }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<IStatus>('idle');

    // Reset status after 5 seconds if there is an error so they can try again
    useEffect(() => {
        if (status !== 'error') return;
        const timer = setTimeout(() => setStatus('idle'), 5000);
        return () => clearTimeout(timer);
    }, [status]);

    const pill = { minWidth: 88, height: 36, paddingHorizontal: 14, borderRadius: 999, gap: 6 };

    if (status === 'syncing') {
        return (
            <View style={[pill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} className="flex flex-row items-center justify-center">
                <ActivityIndicator size="small" color={JOB_COLORS.accent} />
            </View>
        );
    }

    if (status === 'error') {
        return (
            <View style={[pill, { backgroundColor: JOB_COLORS.dangerBackground }]} className="flex flex-row items-center justify-center">
                <WarningCircle size={16} color={JOB_COLORS.danger} weight="bold" />
                <Text style={{ color: JOB_COLORS.danger }} className="text-sm font-medium">{t('connect.import.sync_failed')}</Text>
            </View>
        );
    }

    if (status === 'synced') {
        return (
            <View style={[pill, { backgroundColor: 'rgba(70,192,138,0.15)' }]} className="flex flex-row items-center justify-center">
                <CheckCircle size={16} color={JOB_COLORS.success} weight="bold" />
                <Text style={{ color: JOB_COLORS.success }} className="text-sm font-medium">{t('connect.import.synced')}</Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            onPress={() => syncFromRemote({ module, workspace, setStatus })}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={[pill, { backgroundColor: '#FFFFFF' }]}
            className="flex flex-row items-center justify-center">
            <Text style={{ color: JOB_COLORS.page }} className="text-sm font-medium">{t('connect.import.sync')}</Text>
        </TouchableOpacity>
    );
}
