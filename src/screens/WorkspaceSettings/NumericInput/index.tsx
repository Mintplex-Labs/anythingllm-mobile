import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, CircleNotch } from "phosphor-react-native";
import { WorkspaceType } from "@/database/models/Workspace";
import { IWorkspacePageKey } from "../index";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { screenDimensions } from "@/utils/constants";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import debounce from 'lodash/debounce';
import Workspace from '@/database/models/Workspace';
import { showToast } from "@/utils/Notification";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import useLLMProvider from "@/hooks/useLLMPreference";

interface NumericInputViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
    field: keyof WorkspaceType;
    resetValue: number;
    title: string;
    hint?: string;
    placeholder: string;
    reattachProviderOnSave?: boolean;
    suggestions?: string[];
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function NumericInputView({ workspace, goToPage, field, title, placeholder, resetValue, hint, reattachProviderOnSave = false, suggestions = [] }: NumericInputViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const { LLMProvider } = useLLMProvider();
    const [value, setValue] = useState(workspace[field] ?? resetValue);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newValue: number) => {
            if (
                newValue === workspace[field] ||
                !Workspace.writableFields[field].validate(newValue).valid
            ) {
                setSaveStatus(DEFAULT_SAVE_STATUS);
                return;
            }

            setSaveStatus({ text: 'Autosaving...', state: 'saving' });
            try {
                const updatedWorkspace = await Workspace.update([{ field: 'slug', value: workspace.slug }], { [field]: newValue });

                // Some updates require re-attaching the provider to the workspace
                // enabled via flag
                if (reattachProviderOnSave) {
                    if (!!updatedWorkspace && !!LLMProvider) {
                        LLMProvider.attachWorkspaceToProvider(updatedWorkspace as WorkspaceType);
                    }
                }

                setSaveStatus({ text: 'Autosaved!', state: 'saved' });
            } catch (err) {
                console.error('Error saving context length:', err);
                showToast('Error saving temperature');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleValueChange = useCallback((text: string) => {
        const value = parseFloat(text);
        if (isNaN(value)) return;

        setValue(value);
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
                <Text style={{ maxWidth: '80%', color: '#9F9FA0' }} numberOfLines={1} ellipsizeMode="middle" className="text-lg font-medium">{title}</Text>
            </View>

            <KeyboardAvoidingView style={{ paddingHorizontal: 18, gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 flex flex-col">
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Current {title}</Text>
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
                            textAlignVertical: 'center',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        defaultValue={value.toString()}
                        onChangeText={handleValueChange}
                        placeholder={placeholder}
                    />
                    {value !== resetValue && (
                        <TouchableOpacity onPress={() => handleValueChange(resetValue.toString())} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    {hint && <Text style={{ color: '#9F9FA0' }} className="text-sm">{hint.replace(/\\n/g, '\n')}</Text>}
                </View>
                {suggestions?.length > 0 && (
                    <View style={{ gap: 10, marginTop: 30 }} className="flex flex-col">
                        <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">Suggested {title}</Text>
                        <View style={{ gap: 10, flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'flex-start' }} className="flex flex-row items-center justify-center">
                            {suggestions
                                .filter((suggestion) => suggestion.toString() !== value.toString())
                                .map((suggestion) => (
                                    <TouchableOpacity key={suggestion} style={{ paddingHorizontal: 10, paddingVertical: 5 }} onPress={() => handleValueChange(suggestion)} className="flex flex-row items-center justify-center bg-white/10 rounded-full">
                                        <Text className="text-white">{suggestion}</Text>
                                    </TouchableOpacity>
                                ))}
                        </View>
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeView>
    );
}