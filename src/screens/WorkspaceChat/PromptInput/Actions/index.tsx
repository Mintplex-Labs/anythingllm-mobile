import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { PaperPlaneRight, SlidersHorizontal } from "phosphor-react-native";
import { AttachmentInterface } from '@/hooks/useAttachments';
import AttachmentsButton from './AttachmentsButton';

export const ACTION_MENU_HEIGHT = 40;
export default function ActionMenu({ show, ...props }: { show: boolean, attachmentHandler: AttachmentInterface }) {
    if (!show) return null;
    return (
        <View style={{ height: ACTION_MENU_HEIGHT }} className='flex w-full flex-row items-center justify-between px-2'>
            <View className='flex flex-row items-center gap-x-4'>
                <AttachmentsButton attachmentHandler={props.attachmentHandler} />
                <TouchableOpacity className='flex flex-row items-center gap-x-2'>
                    <SlidersHorizontal size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            <View className='flex flex-row items-center gap-x-4'>
                <TouchableOpacity className='flex flex-row items-center gap-x-2'>
                    <PaperPlaneRight size={22} color="#FFF" weight='fill' />
                </TouchableOpacity>
            </View>
        </View>
    );
}