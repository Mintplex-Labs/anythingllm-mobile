import { Image, ImageBackground, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import SafeView from "@/components/SafeView";
import uiStore from "@/store/UIStore";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { PATHS } from "@/utils/paths";
import React from "react";
import { showToast } from "@/utils/Notification";
import { useTranslation } from "react-i18next";

export default function OnboardingWelcome() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const imageWidth = Math.min(screenWidth * 0.85, 350);
  const handleGetStarted = () => {
    uiStore.setToStorage('onboarding_welcome_completed', true);
    navigation.navigate(PATHS.onboarding.model_selection as never);
  };
  useHighjackBackButtonPress(() => { showToast(t('onboarding.welcome.back_blocked'), 'short'); return true; });

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />
      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="my-auto" containerStyle={{ paddingBottom: insets.bottom, paddingTop: insets.top + 20 }}>
        <View className="flex flex-col h-full justify-between py-4">
          <View className="flex flex-col justify-center items-center gap-y-2">
            <Text className="text-[#B2DDFF] text-xl">{t('onboarding.welcome.title')}</Text>
            <Image source={require("@/assets/logo/anything-llm.png")} resizeMode="contain" style={{ width: 220, height: 32 }} />
          </View>
          <Image
            source={require("@/assets/onboarding/welcome.png")}
            resizeMode="contain"
            style={{ width: imageWidth, maxHeight: '60%', alignSelf: 'center', marginVertical: 16 }}
          />
          <View className="flex max-w-[75%] mx-auto">
            <Text className="text-white text-regular text-center">
              {t('onboarding.welcome.description')}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleGetStarted}
            className="flex w-full bg-[--cta-light-blue] rounded-md p-4 text-center max-w-[85%] mx-auto"
          >
            <Text className="text-[--dark] font-bold text-center">{t('onboarding.welcome.get_started')}</Text>
          </TouchableOpacity>
        </View>
      </SafeView>
    </React.Fragment>
  );
};