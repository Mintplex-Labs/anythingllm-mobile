import * as React from 'react';
import { getApp } from '@react-native-firebase/app'
import { observer } from 'mobx-react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
import { useEnablePushNotifications } from '@/utils/PushNotifications';
import { useOnboardingCompleted } from '@/hooks/useOnboardingHook';

const Drawer = createDrawerNavigator();
const App = observer(() => {
  useEnablePushNotifications();
  const theme = useTheme();
  const styles = rootStyles(theme);
  const { initialRoute, isLoading } = useInitialRoute();
  const { onboardingCompleted, loadingOnboardingCompleted } = useOnboardingCompleted();

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
            <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
              <PaperProvider theme={theme}>
                <LLMPreferenceProvider>
                  <BottomSheetModalProvider>
                    <NavigationContainer>
                      <WorkspaceDrawer initialRouteName={initialRoute.path}>
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
                          name={PATHS.developer.home}
                          component={gestureHandlerRootHOC(
                            Screens.DevToolsMenu,
                          )}
                          options={{ headerShown: false }}
                        />
                      </WorkspaceDrawer>
                    </NavigationContainer>
                  </BottomSheetModalProvider>
                </LLMPreferenceProvider>
              </PaperProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Suspense>
    </BottomSheetProvider>
  );
});

export default App;
