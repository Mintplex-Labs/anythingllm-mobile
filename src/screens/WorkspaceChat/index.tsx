import { ActivityIndicator, Text, View } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import useRedirect from "@/hooks/useRedirect";
import useLlmPreference from "@/hooks/useLLMPreference";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import { useEffect } from "react";
import useWorkspaceThread from "@/hooks/useWorkspaceThread";
import PromptInput, { snapPointsDefault } from "./PromptInput";
import useAttachments from "@/hooks/useAttachments";
import ChatHistory from "./ChatHistory";

// Supplemental UI Sheets from the PromptInput actions
// Must be top level so their refs are not lost when the PromptInput is unmounted
// DO NOT add sheets _inside_ the PromptInput component since they will be unmounted when the PromptInput is unmounted
// thus nulling the ref and preventing the sheet from being dismissed
import SettingsActionSheet from "./PromptInput/Actions/Settings";
import ToolsActionSheet from "./PromptInput/Actions/Settings/Tools";
import WorkspaceFilesActionSheet from "./PromptInput/Actions/Settings/Files";

export default function WorkspaceChat() {
  useRedirect();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { LLMProvider, isLoading: isLoadingProvider, error, fetchLLMPreference } = useLlmPreference();
  const { loadingWorkspaceThread, workspace, thread, error: errorWorkspaceThread } = useWorkspaceThread(wsSlug, threadSlug);
  const attachmentHandler = useAttachments(wsSlug);

  useEffect(() => {
    fetchLLMPreference();
  }, [wsSlug, threadSlug]);

  if (isLoadingProvider || loadingWorkspaceThread) return <LoadingView />;
  if (!!error) return <ErrorView title="Error loading LLM provider" error={error} />;
  if (!!errorWorkspaceThread) return <ErrorView title="Error loading workspace thread" error={errorWorkspaceThread} />;

  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" applyGradient safeAreaStyle={{ backgroundColor: '#000' }}>
      <TopBar modelName={LLMProvider?.model} workspace={workspace} thread={thread} />

      {/* Chat History */}
      <ChatHistory />

      {/* Prompt Input */}
      <PromptInput attachmentHandler={attachmentHandler} />
      <SettingsActionSheet workspace={workspace} thread={thread} />
      <ToolsActionSheet />
      <WorkspaceFilesActionSheet workspace={workspace} />
    </SafeView >
  );
}

function LoadingView() {
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" applyGradient safeAreaStyle={{ backgroundColor: '#000' }}>
      <TopBar />
      <View className="flex h-[80vh] justify-center items-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    </SafeView>
  );
}

function ErrorView({ title, error }: { title: string, error: any }) {
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" applyGradient safeAreaStyle={{ backgroundColor: '#000' }}>
      <TopBar />
      <View className="flex h-[80vh] justify-center items-center">
        <Text className="text-red-500">{title}</Text>
        <Text className="text-red-500">{error?.message || 'Unknown error'}</Text>
      </View>
    </SafeView>
  );
}