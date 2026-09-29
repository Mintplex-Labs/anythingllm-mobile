import { ActivityIndicator, ScrollView, Text, View, RefreshControl } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cloud, Laptop, SquaresFour } from "phosphor-react-native";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import AnythingLLMExternal from "@/utils/AnythingLLMExternal";
import WorkspaceItem from "./WorkspaceItem";
import { CommandResponses } from "@/utils/AnythingLLMExternal";
import uiStore from "@/store/UIStore";
import { showToast } from "@/utils/Notification";
import { unregisterConnection } from "../index";
import { useTranslation } from "react-i18next";
import { ActionButton, Card, JOB_COLORS, ScreenHeader, SectionLabel } from "@/screens/ScheduledJobs/components";

interface ImportViewProps {
    params: { connectionUrl: string, deviceToken: string };
}

function hostnameOf(connectionUrl?: string): string {
    try {
        return connectionUrl ? new URL(connectionUrl).hostname : '';
    } catch {
        return connectionUrl ?? '';
    }
}

export function ImportView({ params }: ImportViewProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    const [module, setModule] = useState<AnythingLLMExternal | null>(null);
    const [workspaces, setWorkspaces] = useState<CommandResponses['workspaces']['workspaces']>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const goBack = () => {
        uiStore.removeFromStorage('current_anythingllm_external_connection');
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.connect_to_instance, params: { page: 'start' } }],
        });
        return true;
    }
    useHighjackBackButtonPress(goBack);

    const goHome = async () => {
        await uiStore.removeFromStorage('current_anythingllm_external_connection');
        uiStore.emitter.emit(uiStore.globalEvents.REFRESH_WORKSPACES);
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.home }],
        });
    };

    async function getWorkspaces() {
        if (!params?.connectionUrl || !params?.deviceToken) return;
        const module = new AnythingLLMExternal(params.connectionUrl, params.deviceToken);
        setModule(module);

        const validateConnection = await module.tokenIsApproved();
        if (!validateConnection) {
            showToast(t('connect.import.connection_expired'), 'short');
            await uiStore.removeFromStorage('current_anythingllm_external_connection');
            await unregisterConnection({ connectionUrl: params.connectionUrl, token: params.deviceToken, platform: 'desktop' });
            navigation.reset({
                index: 0,
                // @ts-ignore
                routes: [{ name: PATHS.connect_to_instance, params: { page: 'start' } }],
            });
            return;
        }
        const workspaces = await module.sendCommand('workspaces');
        setWorkspaces(workspaces.workspaces);
    }

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await getWorkspaces();
        } catch (error) {
            showToast(t('connect.import.refresh_failed'), 'short');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        getWorkspaces()
            .catch(() => showToast(t('connect.import.refresh_failed'), 'short'))
            .finally(() => setLoading(false));
    }, [params?.connectionUrl, params?.deviceToken]);

    // Every workspace from one connection reports the same platform
    const platform = workspaces[0]?.platform;
    const PlatformIcon = platform === 'server' ? Cloud : Laptop;

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: JOB_COLORS.page }}
        >
            <ScreenHeader title={t('connect.title')} onBack={goBack} />
            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20, gap: 24, flexGrow: 1 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#FFF"
                        colors={["#FFF"]}
                    />
                }
            >
                {/* Connection */}
                <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ backgroundColor: JOB_COLORS.chip, width: 44, height: 44 }} className="flex items-center justify-center rounded-full">
                        <PlatformIcon size={22} color={JOB_COLORS.accent} weight="bold" />
                    </View>
                    <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                        <Text numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">{hostnameOf(params?.connectionUrl)}</Text>
                        {!!platform && (
                            <Text numberOfLines={1} style={{ color: JOB_COLORS.muted }} className="text-sm">
                                {platform === 'server' ? t('connect.import.platform_server') : t('connect.import.platform_desktop')}
                            </Text>
                        )}
                    </View>
                </Card>

                {/* Workspaces */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <SectionLabel>{t('connect.import.workspaces')}</SectionLabel>
                    {loading ? (
                        <View className="w-full items-center" style={{ paddingVertical: 40 }}>
                            <ActivityIndicator size="large" color="#FFF" />
                        </View>
                    ) : workspaces.length === 0 ? (
                        <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 16 }}>
                            <View style={{ backgroundColor: JOB_COLORS.chip, width: 64, height: 64 }} className="flex items-center justify-center rounded-full">
                                <SquaresFour size={32} color="#FFF" />
                            </View>
                            <View className="flex flex-col items-center" style={{ gap: 6 }}>
                                <Text className="text-white text-lg font-medium">{t('connect.import.empty_title')}</Text>
                                <Text style={{ color: JOB_COLORS.muted, textAlign: 'center', paddingHorizontal: 12 }} className="text-sm">
                                    {t('connect.import.empty_body')}
                                </Text>
                            </View>
                        </Card>
                    ) : (
                        <Card style={{ gap: 0, paddingVertical: 4 }}>
                            {workspaces.map((workspace, index) => (
                                <WorkspaceItem
                                    key={workspace.id}
                                    module={module as AnythingLLMExternal}
                                    workspace={workspace}
                                    last={index === workspaces.length - 1}
                                />
                            ))}
                        </Card>
                    )}
                    <Text style={{ color: JOB_COLORS.muted }} className="text-sm">{t('connect.import.sync_explainer')}</Text>
                </View>
            </ScrollView>
            <View style={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
                <ActionButton title={t('connect.import.go_home')} tone="secondary" onPress={goHome} />
            </View>
        </SafeView>
    );
}
