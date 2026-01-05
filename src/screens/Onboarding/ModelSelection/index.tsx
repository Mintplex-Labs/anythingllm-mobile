import React, { useState } from "react";
import { ImageBackground, View } from "react-native";
import SimpleModelSelection from "./Simple/index";
import SafeView from "@/components/SafeView";
import ProgressBars from "@/components/Onboarding/ProgressBars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const insets = useSafeAreaInsets();

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />
      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerStyle={{ zIndex: 1, paddingTop: insets.top + 20 }}>
        <View className="flex flex-col gap-y-[66px]">
          <ProgressBars numberOfBars={3} activeBar={1} />
          <SelectionMode />
        </View>
      </SafeView>
    </React.Fragment >
  );
};