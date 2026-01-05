import React, { useState } from "react";
import { ImageBackground, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import ProgressBars from "@/components/Onboarding/ProgressBars";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Telemetry from "@/utils/Telemetry";

const options = [
  {
    id: 'productivity',
    title: 'Increase Productivity',
  },
  {
    id: 'privacy',
    title: 'Privacy Focused chats',
  },
  {
    id: 'custom-ai',
    title: 'Custom AI Agents',
  },
  {
    id: 'automation',
    title: 'AI Automation',
  },
  {
    id: 'other',
    title: 'Other',
  },
]


export default function Survey() {
  const [selection, setSelection] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();

  const onContinue = async () => {
    console.log("Stubbed: Sending survey data to server");
    uiStore.setToStorage('onboarding_survey_completed', true);
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ONBOARDING.SURVEY_RESPONSE, { selection });
    navigation.navigate(PATHS.onboarding.data_handling as never)
  }

  const onBack = () => {
    navigation.navigate(PATHS.onboarding.model_selection as never)
  }

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="h-full z-[1]" containerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}>
        <View className="flex flex-col h-full justify-between">
          <ProgressBars numberOfBars={3} activeBar={2} />

          <React.Fragment>
            <View className="flex flex-col gap-y-4 justify-center items-center">
              <Text className="text-white text-4xl font-bold text-center">What can AnythingLLM help you with?</Text>
              <Text className="text-white/60 text-xl text-center">
                Select the one that most applies to you.
              </Text>
            </View>

            <View className="flex flex-col gap-y-4 items-center">
              {options.map((option, index) => (
                <SurveyOption
                  key={index}
                  title={option.title}
                  onPress={() => setSelection(option.id)}
                  disabled={false}
                  isActive={selection === option.id}
                />
              ))}
            </View>

            <View className="flex flex-row gap-x-4 items-center justify-between">
              <TouchableOpacity onPress={onBack}>
                <Text className="text-[--primary-text] text-xl border border-[--primary-text] rounded-lg px-4 py-2">Back</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={!selection} onPress={onContinue} className="disabled:opacity-50 bg-[--cta-light-blue] rounded-lg px-4 py-2 flex flex-row items-center justify-center">
                <Text className="text-black text-xl">Continue</Text>
              </TouchableOpacity>
            </View>

          </React.Fragment>
        </View>
      </SafeView>
    </React.Fragment >
  );
};

function SurveyOption({ title, onPress, disabled, isActive }: { title: string, onPress: () => void, disabled: boolean, isActive: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{ width: '90%', maxWidth: 380, maxHeight: 60, padding: 17, backgroundColor: isActive ? '#7cd4fd65' : 'rgba(255,255,255, 0.08)' }}
      className={`flex flex-row rounded-lg gap-x-4 items-center ${!disabled ? 'disabled:opacity-50' : ''}`}
      disabled={!!disabled}
      onPress={onPress}
    >
      <View className="flex flex-col gap-y-1">
        <View className="flex flex-row gap-x-2 items-center">
          <Text className="text-white text-xl font-bold">{title}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}