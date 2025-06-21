import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import useWorkspace from "@/hooks/useWorkspace";
import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";

import { LoadingView, ErrorView, MainView } from "./Main";
import { NumericInputView } from "./NumericInput";
import { TextInputView } from "./TextInput";

const PAGES = {
  main: (props: any) => <MainView {...props} />,
  system_prompt: (props: any) => (
    <TextInputView
      {...props}
      multiLine={true}
      field="systemPrompt"
      title="System Prompt"
      placeholder="Enter your system prompt here..."
      resetValue={Workspace.defaultSystemPrompt}
    />
  ),
  name: (props: any) => (
    <TextInputView
      {...props}
      field="name"
      title="Name"
      placeholder="Enter your name here..."
      resetValue={Workspace.defaultName}
    />
  ),
  temperature: (props: any) => (
    <NumericInputView
      {...props}
      field="temperature"
      title="Temperature"
      placeholder="Enter your temperature here..."
      resetValue={Workspace.defaultTemperature}
      reattachProviderOnSave={true}
    />
  ),
  context_length: (props: any) => (
    <NumericInputView
      {...props}
      field="contextLength"
      title="Context Length"
      placeholder="Enter your context length here..."
      resetValue={Workspace.defaultContextLength}
      hint="Keep in mind that the context length is also dependent on the model you are using and has memory implications for your device."
      reattachProviderOnSave={true}
      suggestions={[512, 1024, 2048, 4096, 8192]}
    />
  ),
};
export type IWorkspacePageKey = keyof typeof PAGES;

// Local event emitter for Settings page navigation
const eventEmitter = new NativeEventEmitter();
export default function WorkspaceSettings() {
  useRedirect();
  const { wsSlug, threadSlug } = useChatInfoEmit();
  const { loadingWorkspace, workspace, error: errorWorkspace } = useWorkspace(wsSlug);
  const [page, setPage] = useState<keyof typeof PAGES>('main');

  function navigateToPage(page: keyof typeof PAGES) {
    eventEmitter.emit('setWorkspaceSettingsPage', { page });
  }

  useEffect(() => {
    eventEmitter.addListener('setWorkspaceSettingsPage', (event) => {
      if (!(event.page in PAGES)) throw new Error(`Invalid page: ${event.page}`);
      setPage(event.page as keyof typeof PAGES);
    });
    return () => eventEmitter.removeAllListeners('setWorkspaceSettingsPage');
  }, []);

  if (loadingWorkspace) return <LoadingView />;
  if (!!errorWorkspace) return <ErrorView title="Error loading workspace" error={errorWorkspace} />;
  const Page = PAGES[page as keyof typeof PAGES];
  return <Page goToPage={navigateToPage} workspace={workspace} initialThreadSlug={threadSlug} />;
}

