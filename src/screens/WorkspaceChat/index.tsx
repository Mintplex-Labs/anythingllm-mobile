import { ActivityIndicator, NativeEventEmitter, Text, TouchableOpacity, View, RefreshControl } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "./useChatInfoEmit";
import { useState, useCallback, useRef, useEffect } from "react";
import { FlatList } from "react-native-gesture-handler";
import PromptInput from "./PromptInput";
import useLlmPreference from "@/hooks/useLLMPreference";
import { clearTempMessages } from "@/utils/chat/helpers";
import { Portal, Snackbar } from "react-native-paper";
import { IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";

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
    return (
      <View
        className={`flex flex-row ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <View
          className={`max-w-[80%] rounded-lg p-3 ${isUser ? 'bg-blue-500' : 'bg-gray-700'
            }`}
        >
          <Text className="text-white">
            {item.content}
          </Text>
          <Text className="text-white/50 text-xs mt-1">
            {item.createdAt.toLocaleTimeString()}
          </Text>
        </View>
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
      // setPromptDisabled(true);
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
      <View className="h-[85vh]">
        <ThreadResetAlert />
        <Text className="text-white/50 text-xs font-mono py-1">
          {wsSlug}/{threadSlug}
        </Text>
        <Text className="text-white/50 text-xs font-mono">
          {LLMProvider.name}/{LLMProvider?.model}
        </Text>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.uuid}
          className="flex px-4 pt-4 mb-[25vh]"
          contentContainerStyle={{ flexGrow: 1, }}
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
        />
        <View className="absolute bottom-0 left-0 right-0 h-[23vh]">
          <PromptInput
            promptInput={promptInput}
            onPromptInputChange={setPromptInput}
            onSend={handleSendMessage}
            disabled={promptDisabled}
          />
        </View>
      </View>
    </SafeView>
  );
}

const eventEmitter = new NativeEventEmitter();
function ThreadResetAlert() {
  const [status, setStatus] = useState({
    visible: false,
    message: '',
  });

  useEffect(() => {
    eventEmitter.addListener('threadReset', () => {
      setStatus({ visible: true, message: 'Thread chat history has been reset.' });
    });
    return () => {
      eventEmitter.removeAllListeners('threadReset');
    };
  }, []);

  return (
    <Portal>
      <Snackbar
        visible={status.visible}
        onDismiss={() => setStatus({ visible: false, message: '' })}
        duration={2500}
        action={{
          label: 'Dismiss',
          onPress: () => setStatus({ visible: false, message: '' }),
        }}>
        {status.message ?? 'Action completed'}
      </Snackbar>
    </Portal>
  );
}