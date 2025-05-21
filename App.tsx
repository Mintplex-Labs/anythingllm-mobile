import * as React from 'react';
import { observer } from 'mobx-react';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as PaperProvider } from 'react-native-paper';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  gestureHandlerRootHOC,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import useTheme from '@/hooks/useTheme';
import { rootStyles } from '@/utils/theme';
import MainDrawer from '@/components/Drawer';
import { PATHS } from './src/utils/paths';
import { OnboardingWelcome } from '@/screens';

const Drawer = createDrawerNavigator();
const App = observer(() => {
  const theme = useTheme();
  const styles = rootStyles(theme);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <PaperProvider theme={theme}>
            <NavigationContainer>
              <MainDrawer theme={theme}>

                <Drawer.Screen
                  name={PATHS.onboarding.welcome}
                  component={gestureHandlerRootHOC(OnboardingWelcome)}
                  options={{ headerShown: false }}
                />

              </MainDrawer>
            </NavigationContainer>
          </PaperProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
});

export default App;
