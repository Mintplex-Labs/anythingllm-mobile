import { Paperclip, PaperPlaneTilt } from 'phosphor-react-native';
import React, { Fragment } from 'react';
import { View, TextInput, TouchableOpacity, Text, Keyboard } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { AttachmentInterface } from '@/hooks/useAttachments';

interface PromptInputProps {
  promptInput: string;
  onPromptInputChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  attachmentInterface: AttachmentInterface;
}

export default function PromptInput({
  promptInput,
  onPromptInputChange,
  onSend,
  disabled = false,
  attachmentInterface
}: PromptInputProps) {
  const handleSend = () => {
    Keyboard.dismiss();
    onSend();
  }

  return (
    <Fragment>
      {attachmentInterface.renderAttachments()}
      <View className='h-[100px] -top-[5px]'>
        <View className="flex h-full justify-start bg-[--secondary-bg] rounded-t-lg" >
          <TextInput
            placeholder="Type your message..."
            placeholderTextColor="#666"
            className="h-full text-white text-lg"
            value={promptInput}
            onChangeText={onPromptInputChange}
            multiline
            editable={!disabled}
            textAlignVertical="top"
          />
        </View>
        <View className="bg-[--secondary-bg] fixed bottom-0 left-0 right-0 flex-row items-center justify-center gap-x-2 px-2 pb-2">
          <TouchableOpacity
            className='flex h-full w-[40px] flex-row gap-x-1 items-center justify-center disabled:opacity-50 bg-gray-500 rounded-md p-2'
            onPress={attachmentInterface.askForAttachment}
            onLongPress={attachmentInterface.clearWorkspaceVectors}
          >
            <Paperclip size={18} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            className='flex-1 mx-auto flex-row gap-x-1 items-center justify-center disabled:opacity-70 bg-blue-500 rounded-md p-2'
            onPress={handleSend}
          >
            <Text className='!text-white text-lg'>
              {disabled ? 'Responding...' : 'Send Message'}
            </Text>
            {disabled ? <ActivityIndicator size="small" color="#fff" /> : <PaperPlaneTilt size={14} color="white" />}
          </TouchableOpacity>
        </View>
      </View >
    </Fragment>
  );
}