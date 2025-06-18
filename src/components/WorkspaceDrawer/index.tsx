import { screenDimensions } from "@/utils/constants";
import { createDrawerNavigator, DrawerNavigationOptions } from "@react-navigation/drawer";
import HeaderLeft from "@/components/HeaderLeft";
import SidebarContent from "./SidebarContent";
import useRouteObserver from "@/hooks/useRouteObserver";

interface IWorkspaceDrawer {
  overrideOptions?: Partial<DrawerNavigationOptions>;
  children: React.ReactNode;
  initialRouteName?: string;
}

const Drawer = createDrawerNavigator();
export default function WorkspaceDrawer({
  overrideOptions = {},
  initialRouteName,
  children
}: IWorkspaceDrawer) {
  useRouteObserver();

  // 360 is the max width for the drawer is on wide screens
  // 90% of the screen width for smaller screens
  const width = (screenDimensions.width > 400) ? 360 : screenDimensions.width * 0.9;
  return (
    <Drawer.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerLeft: () => <HeaderLeft />,
        drawerStyle: { width },
      }}
      // @ts-ignore-next-line
      drawerContent={props => <SidebarContent {...props} />}
      {...overrideOptions}
    >
      {children}
    </Drawer.Navigator>
  )
}