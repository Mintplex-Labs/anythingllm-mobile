import { NativeModules } from 'react-native';
const { ToastModule } = NativeModules;

/** Matches Android's Toast.LENGTH_SHORT / LENGTH_LONG */
const DURATION_SECONDS = { short: 2, long: 3.5 };

/** @see ios/AnythingLLM/ToastModule.m */
export const showToast = (message: string, duration: 'short' | 'long' = 'short') => {
    ToastModule.show(message, DURATION_SECONDS[duration]);
};
