import useRedirect from '@/hooks/useRedirect';
import { useEffect, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MainView } from './Main';
import AdvancedModelPreferences from './AdvancedModelPreferences';
import SpecialTools from './SpecialTools';
import AnonymousTelemetry from './AnonymousTelemetry';

const PAGES = {
  main: (props: any) => <MainView {...props} />,
  advanced_model_preferences: (props: any) => (
    <AdvancedModelPreferences {...props} />
  ),
  special_tools: (props: any) => <SpecialTools {...props} />,
  anonymous_telemetry: (props: any) => <AnonymousTelemetry {...props} />,
};
export type IWorkspacePageKey = keyof typeof PAGES;

// Local event emitter for Settings page navigation
const eventEmitter = new NativeEventEmitter();
/** Route params: `page` opens Settings straight on a sub-page (used by anythingllm:// deep links). */
export type UserSettingsRouteParams = { page?: IWorkspacePageKey };

export default function UserSettings() {
  useRedirect();
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as UserSettingsRouteParams | undefined;
  const [page, setPage] = useState<keyof typeof PAGES>(
    params?.page && params.page in PAGES ? params.page : 'main',
  );
  function navigateToPage(page: keyof typeof PAGES) {
    eventEmitter.emit('setUserSettingsPage', { page });
  }

  // A deep link can land here again while we are already mounted - follow the new page and
  // consume the param so re-rendering (or coming back later) does not jump there again.
  useEffect(() => {
    if (!params?.page) return;
    if (params.page in PAGES) setPage(params.page);
    // @ts-ignore - params are untyped on the drawer route
    navigation.setParams({ page: undefined });
  }, [params?.page]); // eslint-disable-line react-hooks/exhaustive-deps

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
