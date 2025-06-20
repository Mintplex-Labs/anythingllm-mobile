import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle } from "phosphor-react-native";
import { WorkspaceType } from "@/database/models/Workspace";
import { IWorkspacePageKey } from "../index";
import { useState, useEffect, useRef, useCallback } from "react";
import { screenDimensions } from "@/utils/constants";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import debounce from 'lodash/debounce';
import Workspace from '@/database/models/Workspace';
import { showToast } from "@/utils/Notification";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import useLLMProvider from "@/hooks/useLLMPreference";

interface ContextLengthViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function ContextLengthView({ workspace, goToPage }: ContextLengthViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const { LLMProvider } = useLLMProvider();
    const [contextLength, setContextLength] = useState(workspace.contextLength ?? Workspace.defaultContextLength);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newContextLength: number) => {
            if (
                newContextLength === workspace.contextLength ||
                !Workspace.writableFields.contextLength.validate(newContextLength).valid
            ) {
                setSaveStatus(DEFAULT_SAVE_STATUS);
                return;
            }

            setSaveStatus({ text: 'Autosaving...', state: 'saving' });
            try {
                const updatedWorkspace = await Workspace.update([{ field: 'slug', value: workspace.slug }], { contextLength: newContextLength });
                if (!!updatedWorkspace && !!LLMProvider) LLMProvider.attachWorkspaceToProvider(updatedWorkspace as WorkspaceType);
                setSaveStatus({ text: 'Autosaved!', state: 'saved' });
            } catch (err) {
                console.error('Error saving context length:', err);
                showToast('Error saving temperature');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleContextLengthChange = useCallback((text: string) => {
        const value = parseFloat(text);
        if (isNaN(value)) return;

        setContextLength(value);
        debouncedSave(value);
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
                <Text style={{ maxWidth: '80%', color: '#9F9FA0' }} numberOfLines={1} ellipsizeMode="middle" className="text-lg font-medium">Context Length</Text>
            </View>

            <KeyboardAvoidingView style={{ paddingHorizontal: 18, gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 flex flex-col">
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Current Context Length</Text>

                        <View className="flex flex-row items-center">
                            <ActivityIndicator size="small" color="#FFF" animating={saveStatus.state === 'saving'} style={{ transform: [{ scale: 0.5 }] }} />
                            {saveStatus.state === 'saved' && <CheckCircle size={12} color="#6CE9A6" style={{ marginRight: 2 }} />}
                            <Text style={{ color: '#9F9FA0' }} className="text-sm">{saveStatus.text}</Text>
                        </View>
                    </View>
                    <TextInput
                        keyboardType="numeric"
                        autoFocus={true}
                        style={{
                            maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                            backgroundColor: '#27282A',
                            textAlignVertical: 'top',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        defaultValue={contextLength.toString()}
                        onChangeText={handleContextLengthChange}
                        placeholder="Enter your context length here..."
                    />
                    {contextLength !== Workspace.defaultContextLength && (
                        <TouchableOpacity onPress={() => handleContextLengthChange(Workspace.defaultContextLength.toString())} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-sm">
                        Keep in mind that the context length is also dependent on the model you are using and has memory implications for your device.{'\n\n'}
                        We recommend not changing this unless you know what you are doing.
                    </Text>
                </View>
            </KeyboardAvoidingView>

        </SafeView >
    );
}