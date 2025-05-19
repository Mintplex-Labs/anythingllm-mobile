import React from 'react';
import {StyleSheet} from 'react-native';

import {PaperProvider} from 'react-native-paper';
import {render} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import {themeFixtures} from './fixtures/theme';

import {user as userFixture} from './fixtures';

import {UserContext} from '../src/utils';
import type {Theme} from '../src/utils/types';

type CustomRenderOptions = {
  theme?: Theme;
  user?: any;
  withNavigation?: boolean;
  withSafeArea?: boolean;
};

const customRender = (
  ui: React.ReactElement,
  {
    theme = themeFixtures.lightTheme,
    user = userFixture,
    withNavigation = false,
    withSafeArea = false,
    ...renderOptions
  }: CustomRenderOptions = {},
) => {
  const Wrapper = ({children}: {children: React.ReactNode}) => {
    const content = withNavigation ? (
      <NavigationContainer>{children}</NavigationContainer>
    ) : (
      children
    );

    const wrappedWithSafeArea = withSafeArea ? (
      <SafeAreaProvider>{content}</SafeAreaProvider>
    ) : (
      content
    );

    return (
      <GestureHandlerRootView style={styles.root}>
        <BottomSheetModalProvider>
          <PaperProvider theme={theme}>
            <UserContext.Provider value={user}>
              {wrappedWithSafeArea}
            </UserContext.Provider>
          </PaperProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    );
  };

  return render(ui, {wrapper: Wrapper, ...renderOptions});
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

// Re-export everything
export * from '@testing-library/react-native';
export {customRender as render};
