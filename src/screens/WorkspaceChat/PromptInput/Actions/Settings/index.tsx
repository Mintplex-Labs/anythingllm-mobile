import React, { useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Gear, Paperclip, SlidersHorizontal } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { ToolsActionButton } from './Tools';
import ResetChatActionButton from './ResetChat';
import { WorkspaceType } from '@/database/models/Workspace';
import { WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { WorkspaceFilesActionButton } from './Files';
import { PATHS } from '@/utils/paths';
import uiStore from '@/store/UIStore';

export default function SettingsActionSheet({ workspace, thread }: { workspace: WorkspaceType, thread: WorkspaceThreadType }) {
    const settingsSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, activeSheet } = useBottomSheet();
    const isRemote = workspace.isRemote || thread.isRemote;

    function goToSettings() {
        if (!workspace?.slug) return;
        uiStore.emitGlobalEvent(uiStore.globalEvents.REDIRECT, {
            path: PATHS.workspace_settings,
            params: { wsSlug: workspace.slug, threadSlug: thread?.slug },
        });
    }

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.SETTINGS, settingsSheetRef);
    }, [registerSheet]);

    return (
        <BottomSheetModal
            ref={settingsSheetRef}
            index={0}
            snapPoints={['25%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            // If the settings sheet is dismissed AND was the current focused, present the primary prompt input sheet
            onDismiss={() => activeSheet === BOTTOM_SHEET_NAMES.SETTINGS && presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <View style={{ paddingHorizontal: 30 }} className='flex flex-row items-center justify-between'>
                <WorkspaceFilesActionButton disabled={isRemote} />
                <ResetChatActionButton />
                <ToolsActionButton disabled={isRemote} />
                <GenericSettingsItem disabled={isRemote} icon={<Gear size={32} color="#FFF" />} text="Settings" onPress={goToSettings} />
            </View>
        </BottomSheetModal>
    );
}

export function SettingsActionIcon() {
    const { presentSheet } = useBottomSheet();
    return (
        <TouchableOpacity onPress={() => presentSheet(BOTTOM_SHEET_NAMES.SETTINGS)}>
            <SlidersHorizontal size={25} color="#FFF" />
        </TouchableOpacity>
    );
}

export function GenericSettingsItem({ disabled = false, icon, text, onPress }: { disabled: boolean, icon: React.ReactNode, text: string, onPress: () => void }) {
    return (
        <TouchableOpacity
            disabled={disabled}
            onPress={onPress}
            style={{ gap: 11, opacity: disabled ? 0.4 : 1 }}
            className='flex flex-col items-center justify-center'
        >
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                {icon}
            </View>
            <Text className='text-white text-lg font-medium'>{text}</Text>
        </TouchableOpacity>
    );
}