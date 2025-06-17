import { useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";
import { showToast } from "@/utils/Notification";
import { PATHS } from "@/utils/paths";

export default function useDevShortcut() {
    const THRESHOLD = 5;
    const developerPressEmitter = new NativeEventEmitter();
    let timer: NodeJS.Timeout;
    const [presses, setPresses] = useState(0);
    function registerPress() { setPresses(prevPresses => prevPresses + 1); }

    useEffect(() => {
        if (presses === 3) showToast(`Press ${THRESHOLD - presses} more times to open developer tools`, 'short');
        if (presses >= THRESHOLD) {
            clearTimeout(timer);
            developerPressEmitter.emit('REDIRECT', {
                path: PATHS.developer.home,
            });
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            setPresses(0);
        }, 5000);
    }, [presses]);

    return { registerPress };
}