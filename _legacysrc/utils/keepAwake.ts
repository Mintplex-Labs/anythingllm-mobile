import {NativeModules} from 'react-native';

const {KeepAwakeModule} = NativeModules;

if (!KeepAwakeModule) {
  console.warn(
    'KeepAwakeModule is not available. Make sure:\n' +
      '- You rebuilt the app after adding the native modules\n' +
      '- The native module is properly linked\n' +
      '- You are not using Expo managed workflow',
  );
}

/**
 * Activates keep awake functionality to prevent the screen from going to sleep
 * @throws {Error} If the native module fails to activate
 */
export const activateKeepAwake = (): void => {
  try {
    KeepAwakeModule.activate();
  } catch (error) {
    console.error('Failed to activate keep awake:', error);
    throw error;
  }
};

/**
 * Deactivates keep awake functionality allowing the screen to go to sleep
 * @throws {Error} If the native module fails to deactivate
 */
export const deactivateKeepAwake = (): void => {
  try {
    KeepAwakeModule.deactivate();
  } catch (error) {
    console.error('Failed to deactivate keep awake:', error);
    throw error;
  }
};
