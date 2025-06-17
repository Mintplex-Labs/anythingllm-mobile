import * as React from 'react';
import { observer } from 'mobx-react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, Provider as PaperProvider } from 'react-native-paper';
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
import { Suspense, useEffect } from 'react';
import SafeView from '@/components/SafeView';
import useInitialRoute from '@/hooks/useInitialRoute';
import './src/utils/polyfills';

const Drawer = createDrawerNavigator();
const App = observer(() => {
  const theme = useTheme();
  const styles = rootStyles(theme);
  const { initialRoute, isLoading } = useInitialRoute();

  if (isLoading) return (
    <SafeAreaProvider>
      <SafeView scrollable={false} containerClassNames='flex h-[100vh] justify-center items-center'>
        <ActivityIndicator size="large" animating={true} color={theme.colors.anythingllm.text.primary} />
      </SafeView>
    </SafeAreaProvider>
  );

  console.log('initialRoute', initialRoute);
  return (
    <Suspense fallback={<ActivityIndicator />}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
            <PaperProvider theme={theme}>
              <BottomSheetModalProvider>
                <NavigationContainer>

                  <WorkspaceDrawer initialRouteName={initialRoute.path}>
                    <Drawer.Screen
                      name={PATHS.onboarding.welcome}
                      component={gestureHandlerRootHOC(Screens.OnboardingWelcome)}
                      options={{ headerShown: false }}
                    />
                    <Drawer.Screen
                      name={PATHS.onboarding.model_selection}
                      component={gestureHandlerRootHOC(Screens.OnboardingModelSelection)}
                      options={{ headerShown: false }}
                    />
                    <Drawer.Screen
                      name={PATHS.onboarding.survey}
                      component={gestureHandlerRootHOC(Screens.OnboardingSurvey)}
                      options={{ headerShown: false }}
                    />
                    <Drawer.Screen
                      name={PATHS.onboarding.data_handling}
                      component={gestureHandlerRootHOC(Screens.OnboardingDataHandling)}
                      options={{ headerShown: false }}
                    />

                    <Drawer.Screen
                      name={PATHS.home}
                      component={gestureHandlerRootHOC(Screens.Home)}
                      options={{ headerShown: false }}
                    />

                    <Drawer.Screen
                      name={PATHS.workspace_chat}
                      component={gestureHandlerRootHOC(Screens.WorkspaceChat)}
                      options={{ headerShown: false }}
                      initialParams={initialRoute.params}
                    />

                    <Drawer.Screen
                      name={PATHS.developer.home}
                      component={gestureHandlerRootHOC(Screens.DevToolsDatabaseInspector)}
                      options={{
                        title: 'Database Inspector',
                      }}
                    />
                  </WorkspaceDrawer>

                </NavigationContainer>
              </BottomSheetModalProvider>
            </PaperProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Suspense>
  )
});

export default App;
