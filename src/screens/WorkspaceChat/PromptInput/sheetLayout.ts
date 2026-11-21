import { Animated } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { ACTION_MENU_HEIGHT } from "./Actions";

/**
 * How the prompt input sheet lays itself out for a snap point. Android draws edge to edge, so the
 * full-screen snap only needs a fixed gap at the top.
 * @see sheetLayout.ios.ts
 */

const defaultPadding = [0, 0, 32]; // top padding for snap points

/** Lay out once a snap has settled */
export const layoutOnSnapStart = false;

export function snapTopPadding(index: number, _lastIndex: number, _insetTop: number): number {
  return defaultPadding[index] ?? defaultPadding[0];
}

export function applyTopPadding(paddingAnim: Animated.Value, value: number) {
  Animated.timing(paddingAnim, {
    toValue: value,
    duration: 150,
    delay: 0,
    useNativeDriver: false,
  }).start();
}

export function promptInputHeight({
  snapPoint,
  isFullScreen,
  keyboardHeight,
  insetBottom,
}: {
  snapPoint: number;
  topPadding: number;
  isFullScreen: boolean;
  keyboardHeight: number;
  insetBottom: number;
}): number {
  const actionMenuHeight = isFullScreen
    ? ACTION_MENU_HEIGHT * 2
    : ACTION_MENU_HEIGHT;
  return (
    screenDimensions.height * snapPoint -
    insetBottom -
    actionMenuHeight -
    keyboardHeight
  );
}

/** The text stays uncontrolled - the native input owns it and reports changes */
export function promptTextProps(prompt: string) {
  return { defaultValue: prompt };
}
