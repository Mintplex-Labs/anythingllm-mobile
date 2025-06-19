import { ActivityIndicator, BackHandler, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import { ArrowLeft, CaretRight, ChatCentered, Cube, File, Thermometer } from "phosphor-react-native";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import { IWorkspacePageKey } from "../index";
import uiStore from "@/store/UIStore";
import { PATHS } from "@/utils/paths";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";

interface MainViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
    initialThreadSlug?: string | null;
}

export function MainView({ workspace, goToPage, initialThreadSlug }: MainViewProps) {
    const insets = useSafeAreaInsets();
    function goBackToWorkspaceChat() {
        uiStore.emitGlobalEvent(uiStore.globalEvents.REDIRECT, {
            path: PATHS.workspace_chat,
            params: { wsSlug: workspace.slug, threadSlug: initialThreadSlug ?? workspace.threads![0].slug },
        });
        return true;
    }
    useHighjackBackButtonPress(goBackToWorkspaceChat);

    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: '#1B1B1E' }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={goBackToWorkspaceChat} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">{workspace.name}</Text>
            </View>

            <ScrollView contentContainerClassName="flex flex-col" contentContainerStyle={{ paddingHorizontal: 18, gap: 24, }}>

                {/* Name */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Workspace Name</Text>
                    <TouchableOpacity style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }} className="w-full flex flex-row items-center rounded-lg" onPress={() => goToPage('name')}>
                        <View className="flex flex-row gap-2 items-center">
                            <Cube size={18} color="#FFF" />
                            <Text className="text-white text-lg">Name</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {workspace?.name || Workspace.defaultName}
                            </Text>
                            <CaretRight size={18} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* System Prompt */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">System Prompt</Text>
                    <TouchableOpacity style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }} className="w-full flex flex-row items-center rounded-lg" onPress={() => goToPage('system_prompt')}>
                        <View className="flex flex-row gap-2 items-center">
                            <ChatCentered size={18} color="#FFF" />
                            <Text className="text-white text-lg">Prompt</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1">
                                {workspace?.systemPrompt || Workspace.defaultSystemPrompt}
                            </Text>
                            <CaretRight size={18} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        The system prompt is the guiding prompt and instructions for the AI. It should be used to guide the AI's behavior and type of responses.
                    </Text>
                </View>

                {/* Temperature */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Temperature</Text>
                    <TouchableOpacity style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }} className="w-full flex flex-row items-center rounded-lg" onPress={() => goToPage('temperature')}>
                        <View className="flex flex-row gap-2 items-center">
                            <Thermometer size={18} color="#FFF" />
                            <Text className="text-white text-lg">Temperature</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {workspace?.temperature || Workspace.defaultTemperature}
                            </Text>
                            <CaretRight size={18} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        The temperature is the level of randomness of the AI's responses. The higher the temperature, the more random the responses will be.
                    </Text>
                </View>

            </ScrollView>
        </SafeView >
    );
}

export function LoadingView() {
    const insets = useSafeAreaInsets();
    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" safeAreaStyle={{ backgroundColor: '#1B1B1E' }}>
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex items-center justify-center">
                <Text className="text-white text-lg font-medium">Settings</Text>
            </View>
            <View className="flex h-[80vh] justify-center items-center">
                <ActivityIndicator size="large" color="#fff" />
            </View>
        </SafeView>
    );
}

export function ErrorView({ title, error }: { title: string, error: any }) {
    const insets = useSafeAreaInsets();
    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" safeAreaStyle={{ backgroundColor: '#1B1B1E' }}>
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex items-center justify-center">
                <Text className="text-white text-lg font-medium">Settings</Text>
            </View>
            <View className="flex h-[80vh] justify-center items-center">
                <Text className="text-red-500">{title}</Text>
                <Text className="text-red-500">{error?.message || 'Unknown error'}</Text>
            </View>
        </SafeView>
    );
}