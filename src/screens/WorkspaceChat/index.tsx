import { ActivityIndicator, NativeEventEmitter, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "./useChatInfoEmit";
import { useState, useCallback, useRef, useEffect } from "react";
import { FlatList } from "react-native-gesture-handler";
import PromptInput from "./PromptInput";
import useLlmPreference from "@/hooks/useLLMPreference";
import { clearTempMessages, DUMMY_MESSAGES } from "@/utils/chat/helpers";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { isDebugMode } from "@/utils/constants";
import ThreadResetAlert from "./ThreadResetSnackbar";
import { KeyboardAccessoryView } from '@/components/KeyboardAccessoryView';
import { parseThinkingParts } from "@/utils/chat";

// Define the message type for our chat
export interface ChatMessage {
  uuid: string;
  content: string;
  role: "user" | "assistant";
  createdAt: Date;
  attachments?: Object[];
  metrics?: Object;
}

export default function WorkspaceChat() {
  useRedirect();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { LLMProvider, isLoading: isLoadingProvider, error, fetchLLMPreference } = useLlmPreference();

  // State for messages and streaming
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [promptDisabled, setPromptDisabled] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const [refreshing, setRefreshing] = useState(false);

  function scrollToBottom() {
    flatListRef.current?.scrollToEnd({ animated: true });
  }

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
    scrollToBottom();
    setPromptInput('');
  }, []);

  // Function to handle streaming messages
  const handleStreamingMessage = useCallback((event: IStreamEvent, content: string | object) => {
    if (event === 'chunk') {
      // Update the last message or create a new one
      const chunk = content as string;
      setMessages(prev => {
        const lastMessage = prev.slice(-1)[0];
        if (lastMessage && lastMessage.role === "assistant") {
          return [...prev.slice(0, -1), {
            ...lastMessage,
            content: lastMessage.content + chunk
          }];
        }
        return [...prev, {
          uuid: Date.now().toString(),
          content: chunk,
          role: "assistant",
          createdAt: new Date(),
          metrics: {}
        },];
      });
    }

    // If the event is completion of streaming, add metrics to the last message
    if (event === 'complete') {
      console.log('completion of streaming', content);
      const metrics = content as object;
      setMessages(prev => {
        const lastMessage = prev[0];
        if (lastMessage && lastMessage.role === "assistant") {
          return [{
            ...lastMessage,
            metrics
          }, ...prev.slice(1)];
        }
        return prev;
      });
    }

    if (event === 'abort') console.error('abort', content);
  }, []);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    const { nonThinkingText, thinkingText, isCompleteThought } = parseThinkingParts(item.content);

    return (
      <View className="flex flex-col gap-y-2">
        {thinkingText && (
          <View className="flex flex-col bg-blue-300/20 rounded-lg p-2 items-start max-w-[100%] ">
            {!isCompleteThought && <Text className="text-white/50 text-xs font-bold">Thinking...</Text>}
            <Text className="italic text-white/50 text-xs break-words">
              {thinkingText}
            </Text>
          </View>
        )}

        {nonThinkingText && (
          <View className={`flex flex-row ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <View className={`max-w-[80%] rounded-lg p-3 ${isUser ? 'bg-blue-500' : 'bg-gray-700'}`}>
              <Text className="text-white">
                {nonThinkingText}
              </Text>
              <Text className="text-white/50 text-xs mt-1">
                {item.createdAt.toLocaleTimeString()}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }, []);

  const handleSendMessage = useCallback(async (forcedContent?: string) => {
    let prompt: string;

    // If the forced content is a string and not empty, use it as the prompt
    if (typeof forcedContent === 'string') {
      prompt = forcedContent.trim();
    } else {
      prompt = promptInput.trim();
    }
    if (!prompt || prompt === '') return;

    // If the user message is /reset, reset the messages
    if (prompt === '/reset') {
      setPromptInput('');
      setPromptDisabled(true);
      clearTempMessages(setMessages).finally(() => {
        setPromptDisabled(false);
      });
      return;
    }

    const newMessage: ChatMessage = {
      uuid: Date.now().toString(),
      content: prompt,
      role: "user",
      createdAt: new Date(),
    };
    const messageHistory = [...messages, newMessage];
    addMessage(newMessage);

    try {
      if (!isDebugMode) setPromptDisabled(true);
      await LLMProvider.chat({
        messages: messageHistory,
        streaming: true,
        onComplete: addMessage,
        onStream: handleStreamingMessage,
      });
    } catch (error: any) {
      console.error('Error getting LLM response:', error);
      const errorMessage: ChatMessage = {
        uuid: Date.now().toString(),
        content: error.message,
        role: "assistant",
        createdAt: new Date(),
      };
      addMessage(errorMessage);
    } finally {
      setPromptDisabled(false);
      setPromptInput('');
      scrollToBottom();
    }
  }, [addMessage, messages, LLMProvider, promptInput]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // TODO: Make backend call to fetch messages
      // For now, just reload the current messages to clear the UI
      setMessages([]);
      await fetchLLMPreference();
    } catch (error) {
      console.error('Error refreshing messages:', error);
    } finally {
      setRefreshing(false);
    }
  }, [messages]);

  if (isLoadingProvider) {
    return (
      <SafeView scrollable={false}>
        <TopBar />
        <View className="flex h-[80vh] justify-center items-center">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeView>
    );
  }

  if (!!error) {
    return (
      <SafeView scrollable={false}>
        <TopBar />
        <View className="flex h-[80vh] justify-center items-center">
          <Text className="text-red-500">Error loading LLM provider</Text>
          <Text className="text-red-500">{error.message}</Text>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView scrollable={false}>
      <TopBar />
      <View className="h-[85vh] pb-20">
        <ThreadResetAlert />
        <Text className="text-white/50 text-xs font-mono py-1">
          {wsSlug}/{threadSlug}
        </Text>
        <Text className="text-white/50 text-xs font-mono">
          {LLMProvider.name}/{LLMProvider?.model}
        </Text>

        <KeyboardAccessoryView
          useListenersOnAndroid={true}
          renderScrollable={(panHandlers) => (
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={item => item.uuid}
              className="flex px-4 pt-4"
              contentContainerStyle={{ flexGrow: 1 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#fff"
                  colors={["#fff"]}
                />
              }
              ListEmptyComponent={() => (
                <View className="flex-1 justify-center items-center gap-y-4">
                  <Text className="text-white/50">Send your first message!</Text>
                  {['Hello, how are you?', 'What is the transfomer model for AI?', 'Explain the tower of hanoi algorithm'].map((message) => (
                    <TouchableOpacity key={message} className="px-4 py-2 border-white/20 border rounded-lg" onPress={() => {
                      handleSendMessage(message);
                    }}>
                      <Text className="text-white">{message}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {...panHandlers}
            />
          )}
        >
          <PromptInput
            promptInput={promptInput}
            onPromptInputChange={setPromptInput}
            onSend={handleSendMessage}
            disabled={promptDisabled}
          />
        </KeyboardAccessoryView>
      </View>
    </SafeView>
  );
}