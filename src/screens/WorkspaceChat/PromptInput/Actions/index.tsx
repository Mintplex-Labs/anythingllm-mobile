import React, { Fragment, useCallback, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ArrowClockwise, Gear, Paperclip, PaperPlaneRight, SlidersHorizontal, Wrench } from "phosphor-react-native";
import { AttachmentInterface } from '@/hooks/useAttachments';
import AttachmentsButton from './AttachmentsButton';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { screenDimensions } from '@/utils/constants';

export const ACTION_MENU_HEIGHT = 40;
export default function ActionMenu({ show, sheetIndex, ...props }: { show: boolean, sheetIndex: number, attachmentHandler: AttachmentInterface }) {
    if (!show) return null;
    const additionalStyles = useCallback(() => {
        if (sheetIndex === 1) return { top: screenDimensions.height / 5, position: 'absolute', zIndex: 2, left: 0, right: 0 } as ViewStyle;
        return {};
    }, [sheetIndex]);

    return (
        <View style={{ height: ACTION_MENU_HEIGHT, ...additionalStyles() }} className='flex w-full flex-row items-center justify-between px-2'>
            <View className='flex flex-row items-center gap-x-4'>
                <AttachmentsButton attachmentHandler={props.attachmentHandler} />
                <SettingsButton />
            </View>

            <View className='flex flex-row items-center gap-x-4'>
                <TouchableOpacity className='flex flex-row items-center gap-x-2'>
                    <PaperPlaneRight size={22} color="#FFF" weight='fill' />
                </TouchableOpacity>
            </View>
        </View>
    );
}

function SettingsButton() {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet } = useBottomSheet();
    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.7}
            />
        ),
        []
    );

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
                backdropComponent={renderBackdrop}
                enablePanDownToClose={true}
                backgroundStyle={{ backgroundColor: '#1B1B1E' }}
                handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
                onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
            >
                <View style={{ paddingHorizontal: 30 }} className='flex flex-row items-center justify-between'>
                    <SettingsItem icon={<Paperclip size={32} color="#FFF" />} text="Files" onPress={() => { }} />
                    <SettingsItem icon={<ArrowClockwise size={32} color="#FFF" />} text="Reset" onPress={() => { }} />
                    <SettingsItem icon={<Wrench size={32} color="#FFF" />} text="Tools" onPress={() => { }} />
                    <SettingsItem icon={<Gear size={32} color="#FFF" />} text="Settings" onPress={() => { }} />
                </View>
            </BottomSheetModal>
        </Fragment>
    );
}

function SettingsItem({ icon, text, onPress }: { icon: React.ReactNode, text: string, onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={{ gap: 11 }} className='flex flex-col items-center justify-center'>
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                {icon}
            </View>
            <Text className='text-white text-lg font-medium'>{text}</Text>
        </TouchableOpacity>
    );
}