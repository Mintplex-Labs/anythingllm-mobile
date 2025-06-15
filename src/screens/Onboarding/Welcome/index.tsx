import { Image, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import uiStore from "@/store/UIStore";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import React from "react";

export default function OnboardingWelcome() {
  const navigation = useNavigation();
  const handleGetStarted = () => {
    uiStore.setToStorage('onboarding_welcome_completed', true);
    navigation.navigate(PATHS.onboarding.model_selection as never);
  };

  return (
    <React.Fragment>
      <Image
        source={require("@/assets/onboarding/bg-blobs.png")}
        resizeMode="contain"
        className="absolute top-0 left-0 w-screen h-[100vh] bg-[--primary-bg]"
      />
      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="h-[88%] my-auto">
        <View className="flex flex-col h-full gap-y-[45px]">
          <View className="flex flex-col justify-center items-center gap-y-2">
            <Text className="text-[#B2DDFF] text-xl">Welcome</Text>
            <Text className="text-white text-3xl">AnythingLLM</Text>
          </View>
          <Image
            source={require("@/assets/onboarding/welcome.png")}
            resizeMode="contain"
            className="max-w-[380px] mx-auto"
          />
          <View className="flex max-w-[65%] mx-auto">
            <Text className="text-white text-regular text-center">
              Run an entire AI assistant entirely on your phone with the power of the AnythingLLM ecosystem.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleGetStarted}
            className="flex w-full bg-[--cta-blue] rounded-md p-4 text-center max-w-[85%] mx-auto"
          >
            <Text className="text-[--dark] font-bold text-center">Get Started</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    </React.Fragment>
  );
};