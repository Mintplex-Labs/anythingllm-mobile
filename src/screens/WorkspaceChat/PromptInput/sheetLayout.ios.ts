import { Animated } from "react-native";
import { screenDimensions } from "@/utils/constants";
import { ACTION_MENU_HEIGHT } from "./Actions";

/**
 * How the prompt input sheet lays itself out for a snap point on iOS.
 * @see sheetLayout.ts
 */

const defaultPadding = [0, 0, 32]; // top padding for snap points

/**
 * Lay out as soon as a snap starts so the content moves with the sheet. Waiting for it to settle leaves the
 * content above the status bar for a moment on the way to full screen.
 */
export const layoutOnSnapStart = true;

/** Full screen covers the status bar - clear the notch / Dynamic Island, which is taller than the default gap */
export function snapTopPadding(index: number, lastIndex: number, insetTop: number): number {
  const padding = defaultPadding[index] ?? defaultPadding[0];
  if (index === lastIndex) return Math.max(padding, insetTop);
  return padding;
}

/**
 * Jumps straight to the new padding. A JS-driven animation would commit every frame while Reanimated
 * moves the sheet on the UI thread, which races in Fabric and can crash. The sheet's own motion hides the jump.
 */
export function applyTopPadding(paddingAnim: Animated.Value, value: number) {
  paddingAnim.setValue(value);
}

/**
 * Fills the sheet exactly so the action row sits just above the keyboard or the home indicator.
 * The iOS keyboard height already includes the home indicator area.
 */
export function promptInputHeight({
  snapPoint,
  topPadding,
  keyboardHeight,
  insetBottom,
}: {
  snapPoint: number;
  topPadding: number;
  isFullScreen: boolean;
  keyboardHeight: number;
  insetBottom: number;
}): number {
  return (
    screenDimensions.height * snapPoint -
    topPadding -
    ACTION_MENU_HEIGHT -
    (keyboardHeight || insetBottom)
  );
}

/**
 * Fabric re-applies a changed `defaultValue` to the native input while typing, which drops keystrokes
 * and jumps the caret, so the text is controlled here. Selection stays native.
 */
export function promptTextProps(prompt: string) {
  return { value: prompt };
}
