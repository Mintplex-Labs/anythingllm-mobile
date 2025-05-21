import { screenDimensions } from "@/utils/constants";
import { darkTheme, rootStyles } from "@/utils/theme";
import { Theme } from "@/utils/types";
import { createDrawerNavigator, DrawerNavigationOptions } from "@react-navigation/drawer";
import HeaderLeft from "../HeaderLeft";
import SidebarContent from "../SidebarContent";

interface IMainDrawer {
  theme?: Theme;
  overrideOptions?: Partial<DrawerNavigationOptions>;
  children: React.ReactNode;
  initialRouteName?: string;
}

const Drawer = createDrawerNavigator();
export default function MainDrawer({
  theme = darkTheme,
  overrideOptions = {},
  initialRouteName,
  children
}: IMainDrawer) {
  const styles = rootStyles(theme);

  return (
    <Drawer.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerLeft: () => <HeaderLeft />,
        drawerStyle: {
          width: screenDimensions.width > 400 ? 320 : screenDimensions.width * 0.8,
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.onBackground,
        headerTitleStyle: styles.headerTitle,
      }}
      drawerContent={props => <SidebarContent {...props} />}
      {...overrideOptions}
    >
      {children}
    </Drawer.Navigator>
  )
}