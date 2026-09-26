import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Microphone, PaperPlaneRight, Stop } from "phosphor-react-native";
import { AttachmentInterface } from '@/hooks/useAttachments';
import AttachmentsButton from './AttachmentsButton';
import { SettingsActionIcon } from './Settings';
import { type ChatHandlerInterface } from '@/hooks/useChatHandler/index';
import { type SpeechToTextInterface } from '@/hooks/useSpeechToText';
import VoiceRecordingIndicator from '@/components/VoiceRecordingIndicator';
import { useTranslation } from 'react-i18next';

export const ACTION_MENU_HEIGHT = 40;
export default function ActionMenu({ isFullScreen, chatHandler, speechToText, ...props }: {
    isFullScreen: boolean,
    sheetIndex?: number,
    attachmentHandler: AttachmentInterface,
    chatHandler: ChatHandlerInterface,
    speechToText: SpeechToTextInterface,
}) {
    const { t } = useTranslation();
    const promptIsEmpty = !chatHandler.prompt?.trim();

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
                    <TouchableOpacity
                        onPress={chatHandler.abortChat}
                        accessibilityLabel={t('chat.prompt_input.stop_generating')}
                        className='flex flex-row items-center gap-x-2'
                    >
                        <Stop size={25} color="#FFF" weight='fill' />
                    </TouchableOpacity>
                ) : speechToText.isListening ? (
                    <TouchableOpacity
                        onPress={speechToText.stopListening}
                        accessibilityLabel={t('chat.prompt_input.stop_recording')}
                        className='flex flex-row items-center gap-x-2'
                    >
                        <VoiceRecordingIndicator volume={speechToText.volume} />
                    </TouchableOpacity>
                ) : promptIsEmpty ? (
                    <TouchableOpacity
                        onPress={speechToText.startListening}
                        disabled={chatHandler.promptDisabled}
                        accessibilityLabel={t('chat.prompt_input.voice_input')}
                        className='flex flex-row items-center gap-x-2 disabled:opacity-50'
                    >
                        <Microphone size={25} color="#FFF" weight='fill' />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onLongPress={chatHandler.reset}
                        onPress={() => chatHandler.submitPrompt(undefined, props.attachmentHandler.imageAttachments)}
                        disabled={chatHandler.promptDisabled}
                        accessibilityLabel={t('chat.prompt_input.send_prompt')}
                        className='flex flex-row items-center gap-x-2 disabled:opacity-50'
                    >
                        <PaperPlaneRight size={25} color="#FFF" weight='fill' />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}
