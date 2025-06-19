import useRedirect from "@/hooks/useRedirect";
import useChatInfoEmit from "@/hooks/useChatInfoEmit";
import useWorkspace from "@/hooks/useWorkspace";
import { LoadingView, ErrorView, MainView } from "./Main";
import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";

const PAGES = {
  main: (props: any) => <MainView {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

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

