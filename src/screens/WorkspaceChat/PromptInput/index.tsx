import { PaperPlaneTilt } from 'phosphor-react-native';
import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

interface PromptInputProps {
  promptInput: string;
  onPromptInputChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export default function PromptInput({ promptInput, onPromptInputChange, onSend, disabled = false }: PromptInputProps) {
  return (
    <View>
      <View className="flex h-full justify-start bg-[--secondary-bg] rounded-t-lg" >
        <TextInput
          placeholder="Type your message..."
          placeholderTextColor="#666"
          className="h-full text-white text-lg max-h-[140px]"
          value={promptInput}
          onChangeText={onPromptInputChange}
          multiline
          editable={!disabled}
          textAlignVertical="top"
        />
        <View className="bg-[--secondary-bg]">
          {disabled ? (
            <View className='flex w-[90%] mx-auto flex-row gap-x-1 items-center justify-center bg-blue-500/20 rounded-md p-2'>
              <Text className='!text-white text-lg'>Responding...</Text>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <TouchableOpacity className='flex w-[90%] mx-auto flex-row gap-x-1 items-center justify-center bg-blue-500 rounded-md p-2' onPress={onSend}>
            <Text className='!text-white text-lg'>Send Message</Text>
            <PaperPlaneTilt size={14} color="white" />
          </TouchableOpacity>
        )}
        </View>
      </View>
    </View >
  );
}