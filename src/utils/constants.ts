import { Dimensions } from "react-native";

/**
 * Determine if the app is running in debug mode.
 */
export const isDebugMode = __DEV__;

/**
 * Get the screen dimensions.
 */
export const screenDimensions = Dimensions.get('window')