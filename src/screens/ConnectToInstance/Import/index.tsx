import { ScrollView, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "phosphor-react-native";
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

interface ImportViewProps {
    params: { connectionUrl: string, deviceToken: string };
}


export function ImportView({ params }: ImportViewProps) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    const [module, setModule] = useState<AnythingLLMExternal | null>(null);
    const [workspaces, setWorkspaces] = useState<CommandResponses['workspaces']['workspaces']>([]);
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

    async function getWorkspaces() {
        if (!params?.connectionUrl || !params?.deviceToken) return;
        const module = new AnythingLLMExternal(params.connectionUrl, params.deviceToken);
        setModule(module);

        const validateConnection = await module.tokenIsApproved();
        if (!validateConnection) {
            showToast('Your existing connection to AnythingLLM Desktop expired.', 'short');
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
            showToast('Failed to refresh workspaces', 'short');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        getWorkspaces();
    }, [params?.connectionUrl, params?.deviceToken]);

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 76 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={goBack} className="absolute top-8 left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">Connect to AnythingLLM</Text>
            </View>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ gap: 33, paddingBottom: 100 }}
                contentContainerClassName="w-full flex flex-col items-center justify-start"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#FFF"
                        colors={["#FFF"]}
                    />
                }
            >
                {workspaces.map((workspace) => <WorkspaceItem key={workspace.id} module={module as AnythingLLMExternal} workspace={workspace} />)}
            </ScrollView>
            <View style={{ paddingBottom: insets.bottom - 8, paddingHorizontal: 30, paddingTop: 8 }} className="w-full flex flex-row items-center justify-center">
                <TouchableOpacity
                    onPress={async () => {
                        await uiStore.removeFromStorage('current_anythingllm_external_connection');
                        uiStore.emitter.emit(uiStore.globalEvents.REFRESH_WORKSPACES);
                        navigation.reset({
                            index: 0,
                            // @ts-ignore
                            routes: [{ name: PATHS.home }],
                        });
                    }}
                    style={{ height: 40, backgroundColor: 'rgba(255, 255, 255, 0.1)', paddingHorizontal: 16, paddingVertical: 8 }}
                    className="flex flex-row w-full items-center justify-center gap-2 rounded-lg">
                    <Text className="text-white font-medium">Go back to home</Text>
                </TouchableOpacity>
            </View>
        </SafeView >
    );
}