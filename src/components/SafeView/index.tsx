import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, StyleProp, View, ViewStyle } from "react-native";
import { Fragment } from "react";
import LinearGradient from "react-native-linear-gradient";

interface SafeViewProps {
  edges?: Edge[];
  scrollable?: boolean;
  children: React.ReactNode;
  safeAreaStyle?: StyleProp<ViewStyle>;
  safeAreaClassNames?: string;
  containerClassNames?: string;
  applyInsets?: boolean;
  applyGradient?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function SafeView({
  edges = [],
  scrollable = true,
  safeAreaStyle = {},
  safeAreaClassNames = 'bg-[--primary-bg]',
  containerClassNames = '',
  containerStyle = {},
  applyInsets = true,
  applyGradient = false,
  children
}: SafeViewProps) {
  const insets = useSafeAreaInsets();
  const containerClassInitial = applyInsets ? `p-4 pb-[${insets.bottom}px]` : '';

  return (
    <SafeAreaView className={`h-full ${safeAreaClassNames}`} edges={edges} style={safeAreaStyle}>
      {applyGradient && (
        <LinearGradient
          pointerEvents="none"
          colors={['#213037', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={{ flex: 1, zIndex: 0, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {scrollable ? (
        <ScrollView contentContainerClassName={`${containerClassInitial} ${containerClassNames}`}>
          {children}
        </ScrollView>
      ) : (
        <View className={`${containerClassInitial} ${containerClassNames}`} style={containerStyle}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}