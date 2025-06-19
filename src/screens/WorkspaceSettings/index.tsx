import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import useWorkspace from "@/hooks/useWorkspace";
import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";

import { LoadingView, ErrorView, MainView } from "./Main";
import { NameView } from "./Name";
import { SystemPromptView } from "./SystemPrompt";
import { TemperatureView } from "./Temperature";

const PAGES = {
  main: (props: any) => <MainView {...props} />,
  system_prompt: (props: any) => <SystemPromptView {...props} />,
  temperature: (props: any) => <TemperatureView {...props} />,
  name: (props: any) => <NameView {...props} />,
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

