import React, { Fragment, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowClockwise, Gear, Paperclip, SlidersHorizontal } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import ToolsAction from './Tools';

export default function SettingsButton() {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet } = useBottomSheet();
    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.SETTINGS, bottomSheetRef);
    }, [registerSheet]);

    return (
        <Fragment>
            <TouchableOpacity onPress={() => presentSheet(BOTTOM_SHEET_NAMES.SETTINGS, true)}>
                <SlidersHorizontal size={22} color="#FFF" />
            </TouchableOpacity>
            <BottomSheetModal
                ref={bottomSheetRef}
                index={0}
                snapPoints={['25%']}
                enableDynamicSizing={false}
                enablePanDownToClose={true}
                backgroundStyle={{ backgroundColor: '#1B1B1E' }}
                handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
                onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
            >
                <View style={{ paddingHorizontal: 30 }} className='flex flex-row items-center justify-between'>
                    <SettingsItem icon={<Paperclip size={32} color="#FFF" />} text="Files" onPress={() => { }} />
                    <SettingsItem icon={<ArrowClockwise size={32} color="#FFF" />} text="Reset" onPress={() => { }} />
                    <ToolsAction />
                    <SettingsItem icon={<Gear size={32} color="#FFF" />} text="Settings" onPress={() => { }} />
                </View>
            </BottomSheetModal>
        </Fragment>
    );
}

export function SettingsItem({ icon, text, onPress }: { icon: React.ReactNode, text: string, onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={{ gap: 11 }} className='flex flex-col items-center justify-center'>
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                {icon}
            </View>
            <Text className='text-white text-lg font-medium'>{text}</Text>
        </TouchableOpacity>
    );
}