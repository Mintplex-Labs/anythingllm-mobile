import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';
import { PaperPlaneRight } from "phosphor-react-native";
import { AttachmentInterface } from '@/hooks/useAttachments';
import AttachmentsButton from './AttachmentsButton';
import { screenDimensions } from '@/utils/constants';
import useKeyboardHeight from '@/hooks/useKeyboardHeight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { snapPointsDefault } from '../index';
import SettingsButton from './Settings';

export const ACTION_MENU_HEIGHT = 40;
export default function ActionMenu({ isFullScreen, sheetIndex, ...props }: { isFullScreen: boolean, sheetIndex?: number, attachmentHandler: AttachmentInterface }) {
    const keyboardHeight = useKeyboardHeight();
    const insets = useSafeAreaInsets();
    const defaultTopPosition = (screenDimensions.height * (parseInt(snapPointsDefault[0]) / 100)) - insets.bottom - ACTION_MENU_HEIGHT;
    const topPositionAnim = useRef(new Animated.Value(defaultTopPosition)).current;

    useEffect(() => {
        const snapPoint = parseInt(snapPointsDefault[sheetIndex ?? 0]) / 100;
        let newTopPosition = (screenDimensions.height * snapPoint) - insets.bottom - ACTION_MENU_HEIGHT - keyboardHeight;
        if (isNaN(newTopPosition)) newTopPosition = defaultTopPosition; // if the calculation is invalid, use the default top position

        Animated.timing(topPositionAnim, {
            toValue: newTopPosition,
            duration: 150,
            delay: 0,
            useNativeDriver: false,
        }).start();
    }, [sheetIndex, keyboardHeight]);

    return (
        <Animated.View
            style={{ height: ACTION_MENU_HEIGHT, top: topPositionAnim, position: 'absolute', zIndex: 2, left: 0, right: 0 }}
            className='flex w-full flex-row items-center justify-between px-2'>
            {isFullScreen ? <View /> : (
                <View className='flex flex-row items-center gap-x-4'>
                    <AttachmentsButton attachmentHandler={props.attachmentHandler} />
                    <SettingsButton />
                </View>
            )}

            <View className='flex flex-row items-center gap-x-4'>
                <TouchableOpacity className='flex flex-row items-center gap-x-2'>
                    <PaperPlaneRight size={22} color="#FFF" weight='fill' />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}