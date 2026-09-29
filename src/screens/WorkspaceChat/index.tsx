import { ActivityIndicator, Text, View } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import useRedirect from "@/hooks/useRedirect";
import useLlmPreference from "@/hooks/useLLMPreference";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import useWorkspaceThread from "@/hooks/useWorkspaceThread";
import PromptInput from "./PromptInput";
import useAttachments, { AttachmentsProvider } from "@/hooks/useAttachments";
import ChatHistory from "./ChatHistory";
import { ChatHandlerWrapper } from "@/hooks/useChatHandler";

// Supplemental UI Sheets from the PromptInput actions
// Must be top level so their refs are not lost when the PromptInput is unmounted
// DO NOT add sheets _inside_ the PromptInput component since they will be unmounted when the PromptInput is unmounted
// thus nulling the ref and preventing the sheet from being dismissed
import SettingsActionSheet from "./PromptInput/Actions/Settings";
import AttachmentsActionSheet from "./PromptInput/Actions/Attachments";
import ToolsActionSheet from "./PromptInput/Actions/Settings/Tools";
import WorkspaceFilesActionSheet from "./PromptInput/Actions/Settings/Files";
import CitationsActionSheet from "./ChatHistory/CitationsActionSheet";
import MessageActionsSheet from "./ChatHistory/MessageActionsSheet";
import DraftSheet from "./ChatHistory/DraftSheet";

export default function WorkspaceChat() {
  useRedirect();
  const { t } = useTranslation();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { LLMProvider, isLoading: isLoadingProvider, error, fetchLLMPreference } = useLlmPreference();
  const { loadingWorkspaceThread, workspace, thread, error: errorWorkspaceThread } = useWorkspaceThread(wsSlug, threadSlug);
  const attachmentHandler = useAttachments(wsSlug, threadSlug);

  useEffect(() => {
    fetchLLMPreference();
  }, [wsSlug, threadSlug]);

  if (isLoadingProvider || loadingWorkspaceThread) return <LoadingView />;
  if (error) return <ErrorView title={t('chat.error_loading_provider')} error={error} />;
  if (errorWorkspaceThread) return <ErrorView title={t('chat.error_loading_thread')} error={errorWorkspaceThread} />;
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" applyGradient safeAreaStyle={{ backgroundColor: '#000' }}>
      <TopBar workspace={workspace} thread={thread} />

      {/* Chat Handler Wrapper manage updates to the chat history and prompt input easily*/}
      <ChatHandlerWrapper workspace={workspace} thread={thread} llmProvider={LLMProvider!}>
        {/* The empty-thread suggestions adapt to shared attachments, so the history needs to see them too */}
        <AttachmentsProvider value={attachmentHandler}>
          <ChatHistory />
          <PromptInput attachmentHandler={attachmentHandler} />
        </AttachmentsProvider>
        {/* Long-press message actions - needs the chat handler context, so it lives inside the wrapper */}
        <MessageActionsSheet workspace={workspace} thread={thread} />
      </ChatHandlerWrapper>

      <SettingsActionSheet workspace={workspace} thread={thread} />
      <AttachmentsActionSheet workspace={workspace} thread={thread} attachmentHandler={attachmentHandler} />
      <ToolsActionSheet />
      <WorkspaceFilesActionSheet workspace={workspace} thread={thread} />
      <CitationsActionSheet />
      <DraftSheet />
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
  const { t } = useTranslation();
  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" applyGradient safeAreaStyle={{ backgroundColor: '#000' }}>
      <TopBar />
      <View className="flex h-[80vh] justify-center items-center">
        <Text className="text-red-500">{title}</Text>
        <Text className="text-red-500">{error?.message || t('chat.unknown_error')}</Text>
      </View>
    </SafeView>
  );
}