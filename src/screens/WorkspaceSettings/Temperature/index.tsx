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

interface TemperatureViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function TemperatureView({ workspace, goToPage }: TemperatureViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const [temperature, setTemperature] = useState(workspace.temperature ?? Workspace.defaultTemperature);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newTemperature: number) => {
            if (
                newTemperature === workspace.temperature ||
                !Workspace.writableFields.temperature.validate(newTemperature).valid
            ) {
                setSaveStatus(DEFAULT_SAVE_STATUS);
                return;
            }

            setSaveStatus({ text: 'Autosaving...', state: 'saving' });
            try {
                await Workspace.update(workspace.slug, { temperature: newTemperature });
                setSaveStatus({ text: 'Autosaved!', state: 'saved' });
            } catch (err) {
                console.error('Error saving temperature:', err);
                showToast('Error saving temperature');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleTemperatureChange = useCallback((text: string) => {
        const value = parseFloat(text);
        if (isNaN(value)) return;

        setTemperature(value);
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
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-[--text-secondary] text-lg font-medium">Temperature</Text>
            </View>

            <KeyboardAvoidingView style={{ paddingHorizontal: 18 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text className="text-[--text-secondary] text-sm uppercase">Current Temperature</Text>

                        <View className="flex flex-row items-center">
                            <ActivityIndicator size="small" color="#FFF" animating={saveStatus.state === 'saving'} style={{ transform: [{ scale: 0.5 }] }} />
                            {saveStatus.state === 'saved' && <CheckCircle size={12} color="#6CE9A6" style={{ marginRight: 2 }} />}
                            <Text className="text-[--text-secondary] text-sm">{saveStatus.text}</Text>
                        </View>
                    </View>
                    <TextInput
                        keyboardType="numeric"
                        editable={saveStatus.state === 'waiting'}
                        autoFocus={true}
                        style={{
                            maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                            backgroundColor: '#27282A',
                            textAlignVertical: 'top',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        defaultValue={temperature.toString()}
                        onChangeText={handleTemperatureChange}
                        placeholder="Enter your temperature here..."
                    />
                    {temperature !== Workspace.defaultTemperature && (
                        <TouchableOpacity onPress={() => handleTemperatureChange(Workspace.defaultTemperature.toString())} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

        </SafeView >
    );
}