import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import useTheme from "@/hooks/useTheme";
import createStyles from "./styles";
import { ScrollView, View, ViewStyle } from "react-native";

interface SafeViewProps {
  edges?: Edge[];
  scrollable?: boolean;
  children: React.ReactNode;
  safeAreaStyles?: Partial<ViewStyle>;
  containerStyles?: Partial<ViewStyle>;
}

export default function SafeView({
  edges = [],
  scrollable = true,
  safeAreaStyles = {},
  containerStyles = {},
  children
}: SafeViewProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  return (
    <SafeAreaView style={{ ...styles.safeArea, ...safeAreaStyles }} edges={edges}>
      {scrollable ? (
        <ScrollView contentContainerStyle={{ ...styles.container, ...containerStyles }}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ ...styles.container, ...containerStyles }}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}