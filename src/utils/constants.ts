import { Dimensions } from "react-native";
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

/**
 * Determine if the app is running in debug mode.
 */
export const isDebugMode = __DEV__;

/**
 * Get the screen dimensions.
 */
export const screenDimensions = Dimensions.get('window')

/**
 * Generate a UUID in React Native.
 */
export const generateUUID = () => {
  return uuidv4();
}