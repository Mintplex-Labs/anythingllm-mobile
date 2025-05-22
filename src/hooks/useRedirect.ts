import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { NativeEventEmitter } from "react-native";

const eventEmitter = new NativeEventEmitter();
export default function useRedirect() {
  const navigation = useNavigation();

  // Listen for redirect events
  useEffect(() => {
    const redirectListener = eventEmitter.addListener('REDIRECT', (event) => {
      console.log('redirecting to', event.path, event.params);
      // @ts-ignore
      navigation.navigate(event.path, event.params as never);
    });
    return () => redirectListener.remove();
  }, []);

  return;
}