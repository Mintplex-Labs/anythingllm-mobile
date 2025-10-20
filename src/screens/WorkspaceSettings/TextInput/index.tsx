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
import useLLMProvider from "@/hooks/useLLMPreference";

interface TextInputViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
    field: keyof WorkspaceType;
    resetValue: number;
    title: string;
    hint?: string;
    placeholder: string;
    reattachProviderOnSave?: boolean;
    multiLine?: boolean;
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function TextInputView({ workspace, goToPage, field, title, placeholder, resetValue, hint, reattachProviderOnSave = false, multiLine = false }: TextInputViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const { LLMProvider } = useLLMProvider();
    // @ts-ignore
    const [value, setValue] = useState(workspace[field] ?? resetValue);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newValue: string) => {
            if (newValue === workspace[field]) return setSaveStatus(DEFAULT_SAVE_STATUS);

            // Run and show error validation if was an invalid input so the user knows why
            const validation: { valid: boolean, error: null | string } = Workspace.writableFields[field].validate(newValue)
            if (!validation.valid) {
                if (validation.error) showToast(validation.error)
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
                console.error('Error saving system prompt:', err);
                showToast('Error saving system prompt');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleValueChange = useCallback((text: string) => {
        // @ts-ignore
        setValue(text);
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
                        multiline={multiLine}
                        numberOfLines={multiLine ? 10 : 1}
                        autoFocus={true}
                        style={{
                            maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                            backgroundColor: '#27282A',
                            textAlignVertical: multiLine ? 'top' : 'center',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        value={value.toString()}
                        onChangeText={handleValueChange}
                        placeholder={placeholder}
                    />
                    {value !== resetValue.toString() && (
                        <TouchableOpacity onPress={() => handleValueChange(resetValue.toString())} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {hint && <Text style={{ color: '#9F9FA0' }} className="text-sm">{hint.replace(/\\n/g, '\n')}</Text>}
            </KeyboardAvoidingView>

        </SafeView >
    );
}