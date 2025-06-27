import useRedirect from "@/hooks/useRedirect";
import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";

import { MainView } from "./Main";

const PAGES = {
  start: (props: any) => <MainView {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

// Local event emitter for Settings page navigation
const eventEmitter = new NativeEventEmitter();
export default function WorkspaceSettings() {
  useRedirect();
  const [page, setPage] = useState<keyof typeof PAGES>('start');

  function navigateToPage(page: keyof typeof PAGES) {
    eventEmitter.emit('setWorkspaceImportPage', { page });
  }

  useEffect(() => {
    eventEmitter.addListener('setWorkspaceSettingsPage', (event) => {
      if (!(event.page in PAGES)) throw new Error(`Invalid page: ${event.page}`);
      setPage(event.page as keyof typeof PAGES);
    });
    return () => eventEmitter.removeAllListeners('setWorkspaceSettingsPage');
  }, []);

  const Page = PAGES[page as keyof typeof PAGES];
  return <Page goToPage={navigateToPage} />;
}

