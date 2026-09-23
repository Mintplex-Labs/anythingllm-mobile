import { AppState, NativeModules } from 'react-native';
const { ScreenLockModule } = NativeModules;

if (!ScreenLockModule) {
  console.warn(
    'ScreenLockModule is not available. Make sure:\n' +
    '- You rebuilt the app after adding the native modules\n' +
    '- The native module is properly linked\n' +
    '- You are not using Expo managed workflow',
  );
}

/**
 * Whether the phone is locked right now (screen off or lock screen showing).
 *
 * Distinguishes "the user locked their phone" from "the user switched apps" - React Native's
 * AppState reports both as `background`. Android answers exactly via the keyguard/power
 * services. iOS has no lock API, so we use protected-data availability, which only flips when
 * the device has a passcode; without one, iOS never reports as locked and no notification is sent.
 *
 * Never throws - a missing module or native error resolves to the AppState fallback.
 */
export const isScreenLocked = async (): Promise<boolean> => {
  const backgrounded = AppState.currentState !== 'active';
  if (!backgrounded) return false;
  if (!ScreenLockModule?.isLocked) return backgrounded;
  try {
    return !!(await ScreenLockModule.isLocked());
  } catch (error) {
    console.error('Failed to read screen lock state:', error);
    return backgrounded;
  }
};
