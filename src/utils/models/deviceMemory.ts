import DeviceInfo from 'react-native-device-info';
import { type DeviceMemory } from '@/utils/models/memoryFit';

/** Reserved for the OS, the app and the KV cache. */
export const MEMORY_RESERVE_BYTES = 2.5e9;

/**
 * Total device RAM and the weights budget, or null when the platform cannot tell us
 * (in which case callers should show no badge at all rather than guess).
 * @see deviceMemory.ios.ts
 */
export function getDeviceMemory(): DeviceMemory | null {
  try {
    const total = DeviceInfo.getTotalMemorySync();
    if (!total) return null;
    return { total, budget: total - MEMORY_RESERVE_BYTES };
  } catch {
    return null;
  }
}
