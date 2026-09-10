import React, { useState } from "react";
import { ImageBackground, View } from "react-native";
import SimpleModelSelection from "./Simple/index";
import ExternalProviderSelection from "./External/index";
import SafeView from "@/components/SafeView";
import ProgressBars from "@/components/Onboarding/ProgressBars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type SelectionModeKey = 'simple' | 'external';

export interface SelectionModeProps {
  /** Switch the onboarding model selection screen to a different selection mode */
  setMode: (mode: SelectionModeKey) => void;
}

const SELECTION_MODES: Record<SelectionModeKey, React.ComponentType<SelectionModeProps>> = {
  simple: SimpleModelSelection,
  external: ExternalProviderSelection,
}

export interface ISelection {
  provider: string;
  config: Record<string, any>;
}

export default function OnboardingModelSelection() {
  const [mode, setMode] = useState<SelectionModeKey>('simple');
  const SelectionMode = SELECTION_MODES[mode];
  const insets = useSafeAreaInsets();

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />
      <SafeView
        scrollable={false}
        safeAreaClassNames="bg-transparent"
        containerClassNames="h-full"
        containerStyle={{ zIndex: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
      >
        <View className="flex flex-col flex-1 gap-y-[66px]">
          <ProgressBars numberOfBars={3} activeBar={1} />
          <SelectionMode setMode={setMode} />
        </View>
      </SafeView>
    </React.Fragment >
  );
};
