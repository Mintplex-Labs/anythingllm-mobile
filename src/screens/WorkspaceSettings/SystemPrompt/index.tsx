import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, CircleNotch } from "phosphor-react-native";
import { WorkspaceType } from "@/database/models/Workspace";
import { IWorkspacePageKey } from "../index";
import { useState, useEffect, useRef, useCallback } from "react";
import { screenDimensions } from "@/utils/constants";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import debounce from 'lodash/debounce';
import Workspace from '@/database/models/Workspace';
import { showToast } from "@/utils/Notification";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";

interface SystemPromptViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function SystemPromptView({ workspace, goToPage }: SystemPromptViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const [systemPrompt, setSystemPrompt] = useState(workspace.systemPrompt);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newSystemPrompt: string) => {
            if (
                newSystemPrompt === workspace.systemPrompt ||
                !Workspace.writableFields.systemPrompt.validate(newSystemPrompt).valid
            ) {
                setSaveStatus(DEFAULT_SAVE_STATUS);
                return;
            }

            setSaveStatus({ text: 'Autosaving...', state: 'saving' });
            try {
                await Workspace.update([{ field: 'slug', value: workspace.slug }], { systemPrompt: newSystemPrompt });
                setSaveStatus({ text: 'Autosaved!', state: 'saved' });
            } catch (err) {
                console.error('Error saving system prompt:', err);
                showToast('Error saving system prompt');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleSystemPromptChange = useCallback((text: string) => {
        setSystemPrompt(text);
        debouncedSave(text);
    }, [debouncedSave]);

    useEffect(() => {
        return () => debouncedSave.cancel();
    }, [debouncedSave]);



    return (
        <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: '#1B1B1E' }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 20 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={() => goToPage('main')} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%', color: '#9F9FA0' }} numberOfLines={1} ellipsizeMode="middle" className="text-lg font-medium">System Prompt</Text>
            </View>

            <KeyboardAvoidingView style={{ paddingHorizontal: 18 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Current Prompt</Text>

                        <View className="flex flex-row items-center">
                            <ActivityIndicator size="small" color="#FFF" animating={saveStatus.state === 'saving'} style={{ transform: [{ scale: 0.5 }] }} />
                            {saveStatus.state === 'saved' && <CheckCircle size={12} color="#6CE9A6" style={{ marginRight: 2 }} />}
                            <Text style={{ color: '#9F9FA0' }} className="text-sm">{saveStatus.text}</Text>
                        </View>
                    </View>
                    <TextInput
                        multiline={true}
                        numberOfLines={10}
                        editable={saveStatus.state === 'waiting'}
                        autoFocus={true}
                        style={{
                            maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                            backgroundColor: '#27282A',
                            textAlignVertical: 'top',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        value={systemPrompt}
                        onChangeText={handleSystemPromptChange}
                        placeholder="Enter your system prompt here..."
                    />
                    {systemPrompt !== Workspace.defaultSystemPrompt && (
                        <TouchableOpacity onPress={() => handleSystemPromptChange(Workspace.defaultSystemPrompt)} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

        </SafeView >
    );
}