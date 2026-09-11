import DeviceInfo from 'react-native-device-info';

/** Hard ceiling for the RAM-derived default. Users can still set a higher value per workspace. */
export const MAX_DEFAULT_CONTEXT_LENGTH = 2048;
/** Used when device memory cannot be read. */
export const FALLBACK_DEFAULT_CONTEXT_LENGTH = 1024;

/**
 * RAM tiers (GB, exclusive upper bound) -> default context length.
 * Evaluated in order; devices at or above the last bound get the max.
 */
const RAM_TIERS: Array<[maxGb: number, contextLength: number]> = [
  [4, 512],
  [6, 1024],
];

let cached: number | null = null;

/**
 * Default workspace context length scaled to the device's total RAM, capped at
 * MAX_DEFAULT_CONTEXT_LENGTH. The on-device KV cache grows with context length, so
 * low-memory phones get a smaller default to avoid OOM during inference.
 */
export function getDefaultContextLength(): number {
  if (cached !== null) return cached;
  try {
    const totalGb = DeviceInfo.getTotalMemorySync() / 1000 / 1000 / 1000;
    if (!Number.isFinite(totalGb) || totalGb <= 0) throw new Error('Invalid total memory');
    const tier = RAM_TIERS.find(([maxGb]) => totalGb < maxGb);
    cached = Math.min(tier ? tier[1] : MAX_DEFAULT_CONTEXT_LENGTH, MAX_DEFAULT_CONTEXT_LENGTH);
  } catch (e) {
    console.error('Failed to read device memory for default context length:', e);
    cached = FALLBACK_DEFAULT_CONTEXT_LENGTH;
  }
  return cached;
}
