import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, StyleProp, View, ViewStyle } from "react-native";

interface SafeViewProps {
  edges?: Edge[];
  scrollable?: boolean;
  children: React.ReactNode;
  safeAreaStyle?: StyleProp<ViewStyle>;
  safeAreaClassNames?: string;
  containerClassNames?: string;
  applyInsets?: boolean;
}

export default function SafeView({
  edges = [],
  scrollable = true,
  safeAreaStyle = {},
  safeAreaClassNames = 'bg-[--primary-bg]',
  containerClassNames = '',
  applyInsets = true,
  children
}: SafeViewProps) {
  const insets = useSafeAreaInsets();
  const containerClassInitial = applyInsets ? `p-4 pb-[${insets.bottom}px]` : '';

  return (
    <SafeAreaView className={`h-full ${safeAreaClassNames}`} edges={edges} style={safeAreaStyle}>
      {scrollable ? (
        <ScrollView contentContainerClassName={`${containerClassInitial} ${containerClassNames}`}>
          {children}
        </ScrollView>
      ) : (
        <View className={`${containerClassInitial} ${containerClassNames}`}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}