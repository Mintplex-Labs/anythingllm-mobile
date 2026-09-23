import DeviceInfo from 'react-native-device-info';

/**
 * Shared "will this GGUF fit on this phone" heuristic.
 *
 * Originally written for the Hugging Face import picker, it now badges every
 * on-device model list (catalog rows, onboarding presets, imported quants) so the
 * same file gets the same verdict wherever it shows up.
 *
 * The verdict only looks at the weights file. The KV cache is allocated on top of
 * the weights, and the OS + the app need room too, which is what the reserve below
 * accounts for. Vision projectors (mmproj) are downloaded separately and ignored here.
 */

export type MemoryFit = 'ok' | 'tight' | 'impossible';

export type DeviceMemory = {
  /** Total physical RAM in bytes */
  total: number;
  /** RAM we consider safe to spend on model weights: total minus `MEMORY_RESERVE_BYTES` */
  budget: number;
};

/** Reserved for the OS, the app and the KV cache. */
export const MEMORY_RESERVE_BYTES = 2.5e9;

/**
 * Total device RAM and the weights budget, or null when the platform cannot tell us
 * (in which case callers should show no badge at all rather than guess).
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

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
};

/**
 * Normalises the `size` field of a list entry to bytes. Catalog and imported models
 * carry bytes already; the onboarding presets carry a display string like "2.01GB".
 * Returns 0 when the value cannot be read so callers can skip the badge.
 */
export function sizeToBytes(size: number | string | null | undefined): number {
  if (typeof size === 'number') return Number.isFinite(size) && size > 0 ? size : 0;
  if (typeof size !== 'string') return 0;
  const match = size.trim().match(/^([\d.]+)\s*([kmgt]?b)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = SIZE_UNITS[match[2].toLowerCase()];
  return Number.isFinite(value) && unit ? Math.round(value * unit) : 0;
}

/**
 * Same thresholds the Hugging Face import picker has always used:
 *  - larger than the phone's RAM: it cannot load at all
 *  - larger than RAM minus the reserve: it may load but will squeeze the OS / KV cache
 *  - otherwise: fine
 * Unknown memory or unknown size returns null so no badge is shown on a guess.
 */
export function memoryFitForSize(size: number | string | null | undefined, memory: DeviceMemory | null): MemoryFit | null {
  const bytes = sizeToBytes(size);
  if (!memory || !bytes) return null;
  if (bytes > memory.total) return 'impossible';
  if (bytes > memory.budget) return 'tight';
  return 'ok';
}

export type FitCandidate = { id: string; size: number | string };

/**
 * Picks the model to call out as the best choice for this device: the largest
 * candidate that fits comfortably. When nothing fits comfortably we still point at
 * the smallest candidate so the user has a starting point, unless even that one
 * cannot load. Returns null when device memory is unknown, so no callout is shown on a guess.
 */
export function pickRecommendedModel<T extends FitCandidate>(candidates: T[], memory: DeviceMemory | null): T | null {
  if (!memory) return null;
  const sized = candidates
    .map(model => ({ model, bytes: sizeToBytes(model.size) }))
    .filter(entry => entry.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes); // largest first
  if (!sized.length) return null;

  const comfortable = sized.find(entry => memoryFitForSize(entry.bytes, memory) === 'ok');
  if (comfortable) return comfortable.model;

  const smallest = sized[sized.length - 1];
  return memoryFitForSize(smallest.bytes, memory) === 'impossible' ? null : smallest.model;
}

/** Copy for the warning pills - a model that fits gets no badge. `compact` is for tight rows (eg. next to a large title). */
export const MEMORY_FIT_LABELS: Record<Exclude<MemoryFit, 'ok'>, { full: string; compact: string }> = {
  tight: { full: 'May not fit in memory', compact: 'May not fit' },
  impossible: { full: 'Too large for this device', compact: 'Too large' },
};
