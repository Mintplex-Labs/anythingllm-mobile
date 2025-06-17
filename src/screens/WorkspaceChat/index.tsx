import { ActivityIndicator, Text, View } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import useRedirect from "@/hooks/useRedirect";
import useLlmPreference from "@/hooks/useLLMPreference";
import { Attachment } from "@/hooks/useAttachments";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import { useEffect } from "react";
import useWorkspaceThread from "@/hooks/useWorkspaceThread";

// Define the message type for our chat
export interface ChatMessage {
  uuid: string;
  content: string;
  role: "user" | "assistant";
  createdAt: Date;
  attachments?: Attachment[];
  metrics?: Object;
}

export default function WorkspaceChat() {
  useRedirect();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { LLMProvider, isLoading: isLoadingProvider, error, fetchLLMPreference } = useLlmPreference();
  const { loadingWorkspaceThread, workspace, thread, fetchWorkspaceThread, error: errorWorkspaceThread } = useWorkspaceThread(wsSlug, threadSlug);

  useEffect(() => {
    async function prepareChatView() {
      await fetchLLMPreference();
    }
    prepareChatView();
  }, [wsSlug, threadSlug]);

  if (isLoadingProvider || loadingWorkspaceThread) return <LoadingView />;
  if (!!error) return <ErrorView title="Error loading LLM provider" error={error} />;
  if (!!errorWorkspaceThread) return <ErrorView title="Error loading workspace thread" error={errorWorkspaceThread} />;

  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px] bg-[--primary-bg]">
      <TopBar modelName={LLMProvider?.model} workspace={workspace} thread={thread} />
    </SafeView >
  );
}

function LoadingView() {
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px] bg-[--primary-bg]">
      <TopBar />
      <View className="flex h-[80vh] justify-center items-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    </SafeView>
  );
}

function ErrorView({ title, error }: { title: string, error: any }) {
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px] bg-[--primary-bg]">
      <TopBar />
      <View className="flex h-[80vh] justify-center items-center">
        <Text className="text-red-500">{title}</Text>
        <Text className="text-red-500">{error?.message || 'Unknown error'}</Text>
      </View>
    </SafeView>
  );
}