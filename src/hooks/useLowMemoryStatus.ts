import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getLowMemoryStatus, LowMemoryStatus } from '@/utils/models/lowMemory';

/** Free memory moves as the user switches apps and the model loads/unloads - re-check on this cadence. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Live low-memory status for the on-device model (null when memory is fine, the provider is
 * not on-device, or `enabled` is false). Re-checks periodically and whenever the app returns
 * to the foreground, since that is when the user may have closed (or opened) other apps.
 */
export default function useLowMemoryStatus(provider: unknown, enabled = true) {
  const [status, setStatus] = useState<LowMemoryStatus | null>(null);

  useEffect(() => {
    if (!enabled || !provider) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    const check = () => {
      getLowMemoryStatus(provider)
        .then(result => { if (!cancelled) setStatus(result); })
        .catch(() => { if (!cancelled) setStatus(null); });
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [provider, enabled]);

  return status;
}
