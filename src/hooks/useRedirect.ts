import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import uiStore from "@/store/UIStore";

export default function useRedirect() {
  const navigation = useNavigation();

  // Listen for redirect events
  useEffect(() => {
    const redirectListener = uiStore.emitter.addListener(uiStore.globalEvents.REDIRECT, (event) => {
      console.log('redirecting to', event.path, event.params);
      // @ts-ignore
      navigation.navigate(event.path, event.params as never);
    });
    return () => redirectListener.remove();
  }, []);

  return;
}