import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { PaperPlaneRight, Stop } from "phosphor-react-native";
import { AttachmentInterface } from '@/hooks/useAttachments';
import AttachmentsButton from './AttachmentsButton';
import { SettingsActionIcon } from './Settings';
import { type ChatHandlerInterface } from '@/hooks/useChatHandler/index';

export const ACTION_MENU_HEIGHT = 40;
export default function ActionMenu({ isFullScreen, chatHandler, ...props }: { isFullScreen: boolean, sheetIndex?: number, attachmentHandler: AttachmentInterface, chatHandler: ChatHandlerInterface }) {
    return (
        <View
            style={{ height: ACTION_MENU_HEIGHT, zIndex: 2, paddingHorizontal: 15 }}
            className='flex w-full flex-row items-center justify-between'>
            {isFullScreen ? <View /> : (
                <View className='flex flex-row items-center gap-x-4'>
                    <AttachmentsButton chatHandler={chatHandler} attachmentHandler={props.attachmentHandler} />
                    <SettingsActionIcon />
                </View>
            )}

            <View className='flex flex-row items-center gap-x-4'>
                {chatHandler.isWorking ? (
                    // While a reply is generating the send button becomes a stop button. Stopping
                    // aborts the model (local, external or remote) and discards the unfinished chat.
                    <TouchableOpacity
                        onPress={chatHandler.abortChat}
                        accessibilityLabel='Stop generating'
                        className='flex flex-row items-center gap-x-2'
                    >
                        <Stop size={25} color="#FFF" weight='fill' />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onLongPress={chatHandler.reset}
                        onPress={() => chatHandler.submitPrompt()}
                        disabled={chatHandler.promptDisabled}
                        accessibilityLabel='Send prompt'
                        className='flex flex-row items-center gap-x-2 disabled:opacity-50'
                    >
                        <PaperPlaneRight size={25} color="#FFF" weight='fill' />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}