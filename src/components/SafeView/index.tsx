import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";

interface SafeViewProps {
  edges?: Edge[];
  scrollable?: boolean;
  children: React.ReactNode;
  safeAreaClassNames?: string;
  containerClassNames?: string;
}

export default function SafeView({
  edges = [],
  scrollable = true,
  safeAreaClassNames = '',
  containerClassNames = '',
  children
}: SafeViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className={`h-full bg-[--primary-bg] ${safeAreaClassNames}`} edges={edges}>
      {scrollable ? (
        <ScrollView contentContainerClassName={`p-4 pb-[${insets.bottom}px] ${containerClassNames}`}>
          {children}
        </ScrollView>
      ) : (
        <View className={`p-4 pb-[${insets.bottom}px] ${containerClassNames}`}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}