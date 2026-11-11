import { NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { type DeviceMemory } from '@/utils/models/memoryFit';

/**
 * Reserved for the app itself and the KV cache. The OS is already outside the per-app limit, so
 * this is smaller than Android's reserve.
 */
export const MEMORY_RESERVE_BYTES = 1e9;

/**
 * The memory this app may use and the weights budget, or null when unknown. iOS stops an app well
 * before physical RAM runs out (jetsam), so the per-app limit is what a model has to fit in, not
 * the RAM on the box. The simulator has no limit and falls back to the host's RAM.
 * @see deviceMemory.ts
 */
export function getDeviceMemory(): DeviceMemory | null {
  try {
    const limit = Number(NativeModules.DeviceInfoModule?.getAppMemoryLimit?.() ?? 0);
    const total = limit || DeviceInfo.getTotalMemorySync();
    if (!total) return null;
    return { total, budget: total - MEMORY_RESERVE_BYTES };
  } catch {
    return null;
  }
}
