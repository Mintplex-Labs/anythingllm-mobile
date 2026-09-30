import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isBatteryOptimized } from '@/utils/ScheduledJobs/scheduler';

/**
 * Whether the app's battery setting is still "Optimized", which lets Doze cut background runs off
 * the network while the phone is locked. Re-read whenever the app comes back to the foreground, so
 * the notice clears as soon as the user returns from switching it to "Unrestricted" in system settings.
 */
export default function useBatteryOptimized(): boolean {
    const [optimized, setOptimized] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const evaluate = () => isBatteryOptimized().then((value) => { if (!cancelled) setOptimized(value); });
        evaluate();
        const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') evaluate(); });
        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return optimized;
}
