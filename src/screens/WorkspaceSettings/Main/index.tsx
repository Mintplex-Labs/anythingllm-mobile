import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import { ArrowLeft, Binary, CaretRight, ChatCentered, Cube, File, Note, Thermometer } from "phosphor-react-native";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import { IWorkspacePageKey } from "../index";
import uiStore from "@/store/UIStore";
import { PATHS } from "@/utils/paths";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import useVectorCount from "@/hooks/useVectorCount";
import AwaitableAlert from "@/components/AwaitableAlert";
import { useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";

interface MainViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
    initialThreadSlug?: string | null;
}

export function MainView({ workspace, goToPage, initialThreadSlug }: MainViewProps) {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<ScrollView>(null);
    const { vectorCount, askToResetVectorsForWorkspace, getVectorCount } = useVectorCount(workspace.slug);
    function goBackToWorkspaceChat() {
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.workspace_chat, params: { wsSlug: workspace.slug, threadSlug: initialThreadSlug ?? workspace.threads![0].slug } }],
        });
        return true;
    }

    async function askToDeleteWorkspace() {
        const confirmDelete = await AwaitableAlert(
            'Delete Workspace?',
            `Are you sure you want to delete this workspace? All threads will be lost.${workspace.isRemote ? '\n\nThis will not delete the workspace in your remote instance.' : ''}`,
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive' }
        );
        if (!confirmDelete) return;
        await Workspace.delete([{ field: 'slug', value: workspace.slug }])
        const workspaces = await Workspace.find([], true);
        if (workspaces.length === 0) {
            navigation.reset({
                index: 0,
                // @ts-ignore
                routes: [{ name: PATHS.home }],
            });
        } else {
            const workspace = workspaces[0];
            navigation.reset({
                index: 0,
                // @ts-ignore
                routes: [{ name: PATHS.workspace_chat, params: { workspaceSlug: workspace.slug, threadSlug: workspace.threads[0].slug } }],
            });
        }
    }

    useHighjackBackButtonPress(goBackToWorkspaceChat);
    useEffect(() => {
        uiStore.emitter.addListener(uiStore.globalEvents.REDIRECT, (event) => {
            if (event.path === PATHS.workspace_settings) {
                getVectorCount();
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            }
        });
        return () => uiStore.emitter.removeAllListeners(uiStore.globalEvents.REDIRECT);
    }, []);

    useEffect(() => {
        getVectorCount();
    }, [workspace.slug]);

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={goBackToWorkspaceChat} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">{workspace.name}</Text>
            </View>

            <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerClassName="flex flex-col" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 200, gap: 24, backgroundColor: '#1B1B1E' }}>
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

                {/* Context Length */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Context Length</Text>
                    <TouchableOpacity style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }} className="w-full flex flex-row items-center rounded-lg" onPress={() => goToPage('context_length')}>
                        <View className="flex flex-row gap-2 items-center">
                            <Note size={18} color="#FFF" />
                            <Text className="text-white text-lg">Context Length</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {workspace?.contextLength || Workspace.defaultContextLength}
                            </Text>
                            <CaretRight size={18} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        The context length is the maximum number of tokens that the AI can use to while generating a response.
                    </Text>
                </View>

                {/* Vector Count */}
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase"> Vector Storage</Text>
                    <TouchableOpacity style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }} className="w-full flex flex-row items-center rounded-lg" onPress={askToResetVectorsForWorkspace}>
                        <View className="flex flex-row gap-2 items-center">
                            <Binary size={18} color="#FFF" />
                            <Text className="text-white text-lg">Vector Count</Text>
                        </View>
                        <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: '#9F9FA0' }} className="text-lg flex-1 text-right">
                                {vectorCount}
                            </Text>
                        </View>
                    </TouchableOpacity>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">
                        This is the number of vectors that are currently stored in the workspace. This is used to store the context of the workspace.
                    </Text>
                </View>


                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <TouchableOpacity
                        onPress={askToDeleteWorkspace}
                        style={{ backgroundColor: 'rgba(122,39,26,0.2)', }} className='flex flex-row items-center justify-center rounded-lg p-4 mb-4'>
                        <Text style={{ color: '#F97066' }} className='text-lg font-medium'>Delete Workspace</Text>
                    </TouchableOpacity>
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