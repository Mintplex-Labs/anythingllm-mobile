import { Dimensions } from "react-native";
import DeviceInfo from "react-native-device-info";
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

/**
 * Get the device information.
 */
export const getCurrentDeviceInfo = () => {
  const os = DeviceInfo.getSystemName();
  const version = DeviceInfo.getSystemVersion();
  return {
    isAndroid: os === 'Android',
    isIOS: os === 'iOS',
    os,
    version,
    apiLevel: DeviceInfo.getApiLevelSync(),
  }
}