import { Image, ImageBackground, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import uiStore from "@/store/UIStore";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { PATHS } from "@/utils/paths";
import React from "react";
import { showToast } from "@/utils/Notification";

export default function OnboardingWelcome() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const handleGetStarted = () => {
    uiStore.setToStorage('onboarding_welcome_completed', true);
    navigation.navigate(PATHS.onboarding.model_selection as never);
  };
  useHighjackBackButtonPress(() => { showToast('Please proceed through the onboarding flow to continue.', 'short'); return true; });

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />
      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="my-auto" containerStyle={{ paddingBottom: insets.bottom, paddingTop: insets.top + 20 }}>
        <View className="flex flex-col h-full justify-between py-4">
          <View className="flex flex-col justify-center items-center gap-y-2">
            <Text className="text-[#B2DDFF] text-xl">Welcome</Text>
            <Text className="text-white text-3xl">AnythingLLM</Text>
          </View>
          <Image
            source={require("@/assets/onboarding/welcome.png")}
            resizeMode="contain"
            className="max-w-[380px] max-h-[60%] mx-auto py-4"
          />
          <View className="flex max-w-[75%] mx-auto">
            <Text className="text-white text-regular text-center">
              Transform your phone into a personal AI assistant to chat with documents, AI agents, and more - all private and on-device.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleGetStarted}
            className="flex w-full bg-[--cta-light-blue] rounded-md p-4 text-center max-w-[85%] mx-auto"
          >
            <Text className="text-[--dark] font-bold text-center">Get Started</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    </React.Fragment>
  );
};