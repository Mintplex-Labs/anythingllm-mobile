import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { showToast } from "@/utils/Notification";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";

export default function useDevShortcut({ workspace, thread }: { workspace?: any, thread?: any }) {
    const THRESHOLD = 5;
    let timer: NodeJS.Timeout;
    const [presses, setPresses] = useState(0);
    function registerPress() { setPresses(prevPresses => prevPresses + 1); }

    function showDebug() {
        if (!workspace || !thread) return;
        Alert.alert('debug', `${workspace?.name}: ${workspace?.slug}\n\n${thread?.name}: ${thread?.slug}`);
    }

    useEffect(() => {
        if (presses === 3) showToast(`Press ${THRESHOLD - presses} more times to open developer tools`, 'short');
        if (presses >= THRESHOLD) {
            clearTimeout(timer);
            setPresses(0);
            uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
                path: PATHS.developer.home,
            });
            return;
        }

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            setPresses(0);
        }, 5000);
    }, [presses]);

    return { registerPress, showDebug };
}