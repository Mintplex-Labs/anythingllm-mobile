import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";

interface SafeViewProps {
  edges?: Edge[];
  scrollable?: boolean;
  children: React.ReactNode;
  safeAreaClassNames?: string;
  containerClassNames?: string;
  applyInsets?: boolean;
}

export default function SafeView({
  edges = [],
  scrollable = true,
  safeAreaClassNames = '',
  containerClassNames = '',
  applyInsets = true,
  children
}: SafeViewProps) {
  const insets = useSafeAreaInsets();
  const containerClassInitial = applyInsets ? `p-4 pb-[${insets.bottom}px]` : '';

  return (
    <SafeAreaView className={`h-full bg-[--primary-bg] ${safeAreaClassNames}`} edges={edges}>
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