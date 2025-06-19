import { useEffect } from "react";
import { BackHandler } from "react-native";

export default function useHighjackBackButtonPress(callback: () => boolean) {
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => callback());
        return () => backHandler.remove();
    }, []);
}