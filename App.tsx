import * as React from 'react';
import { getApp } from '@react-native-firebase/app'
import { observer } from 'mobx-react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  gestureHandlerRootHOC,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import useTheme from '@/hooks/useTheme';
import { rootStyles } from '@/utils/theme';
import WorkspaceDrawer from '@/components/WorkspaceDrawer';
import { PATHS } from './src/utils/paths';
import Screens from '@/screens';
import './global.css';
import { Suspense } from 'react';
import SafeView from '@/components/SafeView';
import useInitialRoute from '@/hooks/useInitialRoute';
import './src/utils/polyfills';
import { BottomSheetProvider } from '@/contexts/BottomSheetContext';
import { LLMPreferenceProvider } from '@/contexts/LLMPreferenceContext';
import { useEnablePushNotifications, useNotificationTapNavigation } from '@/utils/PushNotifications';
import { navigationRef, flushPendingNavigation } from '@/utils/navigationRef';
import { useOnboardingCompleted } from '@/hooks/useOnboardingHook';
import { purgeOrphanedFiles } from '@/utils/fs/cleanup';
import { useScheduledJobsTicker } from '@/utils/ScheduledJobs/scheduler';
import { useSharedContentNavigation } from '@/utils/SharedContent';
import { useDeepLinkNavigation } from '@/utils/DeepLinks';
import HighlightsHost from '@/components/Highlights/HighlightsHost';
import ErrorBoundary, { RootErrorFallback } from '@/components/ErrorBoundary';

const Drawer = createDrawerNavigator();
const App = observer(() => {
  useEnablePushNotifications();
  useNotificationTapNavigation();
  // Files and images other apps share to AnythingLLM open in a new thread with the content attached.
  useSharedContentNavigation();
  // anythingllm:// links, eg. Hugging Face "Use this model" opening the on-device model picker.
  useDeepLinkNavigation();
  // Runs due scheduled jobs while the app is open and keeps the background wake-up armed.
  useScheduledJobsTicker();
  const theme = useTheme();
  const styles = rootStyles(theme);
  const { initialRoute, isLoading } = useInitialRoute();
  const { onboardingCompleted, loadingOnboardingCompleted } = useOnboardingCompleted();
  // Sweep processed text, generated documents and picker temp files nothing references anymore.
  React.useEffect(() => { purgeOrphanedFiles(); }, []);
  // Once onboarding completes its screens are removed from the drawer, but initialRoute was
  // resolved at launch and may still name one of them. React Navigation 7 throws on an unknown
  // initialRouteName (v6 ignored it), so fall back to Home in that case.
  // Set when the user leaves the root error screen with "Go Home" - the remounted navigator
  // must not reopen the launch route, which may be the screen that crashed.
  const [recoveredFromError, setRecoveredFromError] = React.useState(false);
  const drawerInitialRoute =
    onboardingCompleted &&
    (recoveredFromError || Object.values(PATHS.onboarding).includes(initialRoute.path))
      ? PATHS.home
      : initialRoute.path;

  if (isLoading || loadingOnboardingCompleted)
    return (
      <SafeAreaProvider>
        <SafeView
          scrollable={false}
          containerClassNames="flex h-[100vh] justify-center items-center">
          <ActivityIndicator
            size="large"
            animating={true}
            color={theme.colors.anythingllm.text.primary}
          />
        </SafeView>
      </SafeAreaProvider>
    );

  // console.log('initialRoute', initialRoute);
  return (
    <BottomSheetProvider>
      <Suspense fallback={<ActivityIndicator />}>
        <GestureHandlerRootView style={styles.root}>
          <SafeAreaProvider>
            <StatusBar barStyle='default' backgroundColor="transparent" translucent />
            {/*
              No KeyboardProvider (react-native-keyboard-controller) here on purpose.
              Its native view dispatches focus/keyboard events on the UI thread which
              Reanimated turns into a synchronous Fabric commit. When that races a
              commit from the JS thread the two threads deadlock on the Binding
              mutex and Android reports an ANR - reproducible by typing in the
              prompt after a message has been sent. Nothing in the app consumed
              its values; keyboard height comes from RN's Keyboard events instead.
            */}
            {/* Any render error below shows an error screen instead of closing the app */}
            <ErrorBoundary
              name="root"
              fallback={(props) => <RootErrorFallback {...props} />}
              onReset={() => setRecoveredFromError(true)}>
              <PaperProvider theme={theme}>
                <LLMPreferenceProvider>
                  <BottomSheetModalProvider>
                    <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
                      <WorkspaceDrawer initialRouteName={drawerInitialRoute}>
                        {!onboardingCompleted && (
                          <>
                            <Drawer.Screen
                              name={PATHS.onboarding.welcome}
                              component={gestureHandlerRootHOC(
                                Screens.OnboardingWelcome,
                              )}
                              options={{
                                headerShown: false,
                                swipeEnabled: false,
                                gestureHandlerProps: {
                                  enabled: false,
                                }
                              }}
                            />
                            <Drawer.Screen
                              name={PATHS.onboarding.model_selection}
                              component={gestureHandlerRootHOC(
                                Screens.OnboardingModelSelection,
                              )}
                              options={{
                                headerShown: false,
                                swipeEnabled: false,
                                gestureHandlerProps: {
                                  enabled: false,
                                }
                              }}
                            />
                            <Drawer.Screen
                              name={PATHS.onboarding.survey}
                              component={gestureHandlerRootHOC(
                                Screens.OnboardingSurvey,
                              )}
                              options={{
                                headerShown: false,
                                swipeEnabled: false,
                                gestureHandlerProps: {
                                  enabled: false,
                                }
                              }}
                            />
                            <Drawer.Screen
                              name={PATHS.onboarding.data_handling}
                              component={gestureHandlerRootHOC(
                                Screens.OnboardingDataHandling,
                              )}
                              options={{
                                headerShown: false,
                                swipeEnabled: false,
                                gestureHandlerProps: {
                                  enabled: false,
                                }
                              }}
                            />
                          </>
                        )}

                        <Drawer.Screen
                          name={PATHS.home}
                          component={gestureHandlerRootHOC(Screens.Home)}
                          options={{ headerShown: false }}
                        />
                        <Drawer.Screen
                          name={PATHS.workspace_chat}
                          component={gestureHandlerRootHOC(
                            Screens.WorkspaceChat,
                          )}
                          options={{ headerShown: false }}
                          initialParams={initialRoute.params}
                        />
                        <Drawer.Screen
                          name={PATHS.workspace_settings}
                          component={gestureHandlerRootHOC(
                            Screens.WorkspaceSettings,
                          )}
                          options={{ headerShown: false }}
                          initialParams={initialRoute.params}
                        />

                        {/* Connect to instance screens and flows */}
                        <Drawer.Screen
                          name={PATHS.connect_to_instance}
                          component={gestureHandlerRootHOC(
                            Screens.ConnectToInstance,
                          )}
                          options={{ headerShown: false }}
                          initialParams={initialRoute.params}
                        />

                        <Drawer.Screen
                          name={PATHS.user_settings}
                          component={gestureHandlerRootHOC(
                            Screens.UserSettings,
                          )}
                          options={{ headerShown: false }}
                        />

                        <Drawer.Screen
                          name={PATHS.scheduled_jobs}
                          component={gestureHandlerRootHOC(
                            Screens.ScheduledJobs,
                          )}
                          options={{ headerShown: false }}
                        />

                        <Drawer.Screen
                          name={PATHS.developer.home}
                          component={gestureHandlerRootHOC(
                            Screens.DevToolsMenu,
                          )}
                          options={{ headerShown: false }}
                        />
                      </WorkspaceDrawer>
                    </NavigationContainer>
                    {/* Shows what's new once after onboarding and once per update that ships highlights */}
                    <HighlightsHost />
                  </BottomSheetModalProvider>
                </LLMPreferenceProvider>
              </PaperProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Suspense>
    </BottomSheetProvider>
  );
});

export default App;
