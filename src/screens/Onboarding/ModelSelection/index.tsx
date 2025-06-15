import React, { useState } from "react";
import { Image, View } from "react-native";
import SimpleModelSelection from "./Simple";
import SafeView from "@/components/SafeView";
import ProgressBars from "@/components/Onboarding/ProgressBars";

const SELECTION_MODES = {
  simple: SimpleModelSelection,
}

export interface ISelection {
  provider: string;
  config: Record<string, any>;
}

export default function OnboardingModelSelection() {
  const [mode, _setMode] = useState<keyof typeof SELECTION_MODES>('simple');
  const SelectionMode = SELECTION_MODES[mode];

  return (
    <React.Fragment>
      <View pointerEvents="none" className="absolute top-0 left-0 w-screen h-[100vh] z-[2]">
        <Image
          source={require("@/assets/onboarding/bg-blobs.png")}
          resizeMode="contain"
          className="w-screen h-[100vh]"
        />
      </View>

      <SafeView scrollable={false} safeAreaClassNames="bg-[--primary-bg]" containerClassNames="h-[88%] my-auto z-[1]">
        <View className="flex flex-col gap-y-[66px]">
          <ProgressBars numberOfBars={3} activeBar={1} />
          <SelectionMode />
        </View>
      </SafeView>
    </React.Fragment >
  );
};