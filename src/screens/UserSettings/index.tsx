import useRedirect from '@/hooks/useRedirect';
import { useEffect, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { MainView } from './Main';
import AdvancedModelPreferences from './AdvancedModelPreferences';

const PAGES = {
  main: (props: any) => <MainView {...props} />,
  advanced_model_preferences: (props: any) => (
    <AdvancedModelPreferences {...props} />
  ),
};
export type IWorkspacePageKey = keyof typeof PAGES;

// Local event emitter for Settings page navigation
const eventEmitter = new NativeEventEmitter();
export default function UserSettings() {
  useRedirect();
  const [page, setPage] = useState<keyof typeof PAGES>('main');
  function navigateToPage(page: keyof typeof PAGES) {
    eventEmitter.emit('setUserSettingsPage', { page });
  }

  useEffect(() => {
    eventEmitter.addListener('setUserSettingsPage', event => {
      if (!(event.page in PAGES))
        throw new Error(`Invalid page: ${event.page}`);
      setPage(event.page as keyof typeof PAGES);
    });
    return () => eventEmitter.removeAllListeners('setUserSettingsPage');
  }, []);

  const Page = PAGES[page as keyof typeof PAGES];
  return <Page goToPage={navigateToPage} />;
}
