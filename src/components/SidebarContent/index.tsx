import React from 'react';
import { View } from 'react-native';
import { Divider, Drawer, Text } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';

import useTheme from '@/hooks/useTheme';
import { createStyles } from './styles';

export default function SidebarContent(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <GestureHandlerRootView style={styles.sidebarContainer}>
      <View style={styles.contentWrapper}>
        <DrawerContentScrollView {...props}>
          <Drawer.Section showDivider={false}>
            <Text style={{
              color: theme.colors.primary,
            }}>Hello</Text>
            {/* <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.chat}
                icon={() => <ChatIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.CHAT)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.models}
                icon={() => <ModelIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.MODELS)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.pals}
                icon={() => <PalIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.PALS)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.benchmark}
                icon={() => <BenchmarkIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.BENCHMARK)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.settings}
                icon={() => (
                  <SettingsIcon
                    width={24}
                    height={24}
                    stroke={theme.colors.primary}
                  />
                )}
                onPress={() => props.navigation.navigate(ROUTES.SETTINGS)}
                style={styles.menuDrawerItem}
              />

              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.appInfo}
                icon={() => (
                  <PlaceholderIcon
                    width={24}
                    height={24}
                    stroke={theme.colors.primary}
                  />
                )}
                onPress={() => props.navigation.navigate(ROUTES.APP_INFO)}
                style={styles.menuDrawerItem}
              /> */}
          </Drawer.Section>
          <Divider style={styles.divider} />
        </DrawerContentScrollView>
      </View>
    </GestureHandlerRootView>
  );
}
