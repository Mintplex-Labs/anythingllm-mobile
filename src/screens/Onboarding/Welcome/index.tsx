import { Image, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import uiStore from "@/store/UIStore";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";

export default function OnboardingWelcome() {
  const navigation = useNavigation();
  const handleGetStarted = () => {
    uiStore.setToStorage('onboarding_welcome_completed', true);
    navigation.navigate(PATHS.onboarding.model_selection as never);
  };

  return (
    <SafeView scrollable={false}>
      <View className="flex flex-col h-[90vh] justify-center items-center">
        <Image
          source={require("@/assets/logo/anything-llm.png")}
          resizeMode="contain"
          className="w-[70vw]"
        />
        <TouchableOpacity
          onPress={handleGetStarted}
          className="border-2 border-white rounded-md p-4 w-[70vw] animate-pulse"
        >
          <Text className="text-white text-xl font-bold text-center">Get Started</Text>
        </TouchableOpacity>
      </View>
      <View className="flex flex-col justify-end h-[10vh] items-center pb-[40px]">
        <Image
          source={require("@/assets/logo/mintplex-labs.png")}
          resizeMode="contain"
          className="w-[50vw] h-[10vh] opacity-50"
        />
      </View>
    </SafeView>
  );
};
