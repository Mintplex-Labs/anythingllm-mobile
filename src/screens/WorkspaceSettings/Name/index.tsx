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

interface NameViewProps {
    workspace: WorkspaceType;
    goToPage: (page: IWorkspacePageKey) => void;
}

const DEFAULT_SAVE_STATUS = {
    text: '',
    state: 'waiting' as 'waiting' | 'saving' | 'saved',
};

export function NameView({ workspace, goToPage }: NameViewProps) {
    useHighjackBackButtonPress(() => { goToPage('main'); return true; });
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const [name, setName] = useState(workspace.name);
    const [saveStatus, setSaveStatus] = useState(DEFAULT_SAVE_STATUS);

    const debouncedSave = useRef(
        debounce(async (newName: string) => {
            if (
                newName === workspace.name ||
                !Workspace.writableFields.name.validate(newName).valid
            ) {
                setSaveStatus(DEFAULT_SAVE_STATUS);
                return;
            }

            setSaveStatus({ text: 'Autosaving...', state: 'saving' });
            try {
                await Workspace.update([{ field: 'slug', value: workspace.slug }], { name: newName });
                setSaveStatus({ text: 'Autosaved!', state: 'saved' });
            } catch (err) {
                console.error('Error saving system prompt:', err);
                showToast('Error saving system prompt');
            } finally {
                setTimeout(() => setSaveStatus(DEFAULT_SAVE_STATUS), 2000);
            }
        }, 1000)
    ).current;

    const handleNameChange = useCallback((text: string) => {
        setName(text);
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
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-[--text-secondary] text-lg font-medium">Workspace Name</Text>
            </View>

            <KeyboardAvoidingView style={{ paddingHorizontal: 18 }} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <View className="w-full flex flex-col" style={{ gap: 12 }}>
                    <View className="flex flex-row items-center justify-between">
                        <Text className="text-[--text-secondary] text-sm uppercase">Current Name</Text>

                        <View className="flex flex-row items-center">
                            <ActivityIndicator size="small" color="#FFF" animating={saveStatus.state === 'saving'} style={{ transform: [{ scale: 0.5 }] }} />
                            {saveStatus.state === 'saved' && <CheckCircle size={12} color="#6CE9A6" style={{ marginRight: 2 }} />}
                            <Text className="text-[--text-secondary] text-sm">{saveStatus.text}</Text>
                        </View>
                    </View>
                    <TextInput
                        numberOfLines={1}
                        editable={saveStatus.state === 'waiting'}
                        autoFocus={true}
                        style={{
                            maxHeight: screenDimensions.height - keyboardHeight - insets.top - insets.bottom - 200,
                            backgroundColor: '#27282A',
                            textAlignVertical: 'top',
                            padding: 16
                        }}
                        className="rounded-lg text-white placeholder:text-white/50 text-left"
                        value={name}
                        onChangeText={handleNameChange}
                        placeholder="Enter your workspace name here..."
                    />
                    {name !== Workspace.defaultName && (
                        <TouchableOpacity onPress={() => handleNameChange(Workspace.defaultName)} className="flex flex-row items-center justify-center">
                            <Text className="text-white">Reset</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>

        </SafeView >
    );
}