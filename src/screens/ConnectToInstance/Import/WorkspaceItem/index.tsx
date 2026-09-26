import AnythingLLMExternal, { CommandResponses } from "@/utils/AnythingLLMExternal";
import { formatNumber } from "@/utils/formatters";
import { CheckCircle, Cloud, Laptop } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { syncFromRemote } from "./sync";
import { useTranslation } from "react-i18next";

type IStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface WorkspaceItemProps {
    module: AnythingLLMExternal;
    workspace: CommandResponses['workspaces']['workspaces'][number];
}

export default function WorkspaceItem({ module, workspace }: WorkspaceItemProps) {
    const { t } = useTranslation();

    return (
        <View className="flex flex-row justify-between w-full rounded-lg items-center" style={{ padding: 16, backgroundColor: '#27282A' }}>
            <View className="flex flex-col items-start" style={{ gap: 4, width: '65%' }}>
                <Text numberOfLines={1} ellipsizeMode="tail" className="text-white text-lg font-medium" style={{ width: '100%' }}>{workspace.name}</Text>
                <View className="flex flex-row items-center" style={{ gap: 4 }}>
                    <Text className="text-white text-base" style={{ color: '#9F9FA0' }}>{t('connect.import.thread_count', { count: workspace.threadCount + 1, formatted: formatNumber(workspace.threadCount + 1) })}</Text>
                    <Text className="text-white text-base" style={{ color: '#9F9FA0' }}>|</Text>
                    <Text className="text-white text-base" style={{ color: '#9F9FA0' }}>{t('connect.import.chat_count', { count: workspace.chatCount, formatted: formatNumber(workspace.chatCount) })}</Text>
                </View>
                <View className="flex flex-row items-center" style={{ gap: 4, opacity: 0.75 }}>
                    {workspace.platform === 'desktop' && <Laptop size={16} color="#7cd4fd" weight="bold" />}
                    {workspace.platform === 'server' && <Cloud size={16} color="#7cd4fd" weight="bold" />}
                    <Text className="text-white text-sm" style={{ color: '#7cd4fd' }}>{new URL(module.connectionUrl).hostname}</Text>
                </View>
            </View>
            <SyncButton module={module} workspace={workspace} />
        </View>
    );
}

function SyncButton({ module, workspace }: { module: AnythingLLMExternal, workspace: CommandResponses['workspaces']['workspaces'][number] }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<IStatus>('idle');

    // Reset status after 5 seconds if there is an error so they can try again
    useEffect(() => {
        if (status === 'error') setTimeout(() => { setStatus('idle') }, 5000);
    }, [status]);

    if (status === 'syncing') {
        return (
            <TouchableOpacity
                disabled={true}
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: 8 }} className="flex flex-row items-center justify-center rounded-lg">
                <ActivityIndicator size="small" color="#7cd4fd" />
            </TouchableOpacity>
        )
    }

    if (status === 'error') {
        return (
            <TouchableOpacity
                disabled={true}
                style={{ backgroundColor: 'rgba(255, 0, 0, 0.1)', paddingHorizontal: 16, paddingVertical: 8 }} className="flex flex-row items-center justify-center rounded-lg">
                <Text className="text-red-500 font-medium">{t('connect.import.sync_failed')}</Text>
            </TouchableOpacity>
        )
    }

    if (status === 'synced') {
        return (
            <TouchableOpacity
                disabled={true}
                style={{ backgroundColor: 'rgba(32, 255, 117, 0.1)', paddingHorizontal: 16, paddingVertical: 8, gap: 2 }} className="flex flex-row items-center justify-center rounded-lg">
                <CheckCircle size={16} color="#32ff75" />
                <Text className="font-medium" style={{ color: '#32ff75' }}>{t('connect.import.synced')}</Text>
            </TouchableOpacity>
        )
    }

    return (
        <TouchableOpacity
            onPress={() => syncFromRemote({ module, workspace, setStatus })}
            style={{ backgroundColor: '#7cd4fd', paddingHorizontal: 16, paddingVertical: 8 }} className="flex flex-row items-center justify-center rounded-lg">
            <Text className="text-black font-medium">{t('connect.import.sync')}</Text>
        </TouchableOpacity>
    )
}