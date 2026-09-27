import { NativeModules } from 'react-native';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import { formatBytes } from '@/utils/formatters';
import uiStore from '@/store/UIStore';
import i18n from '@/i18n';
import type { ChatMemoryEstimate } from '@/utils/models/memoryEstimate';

/**
 * "You are about to run a model on 176MB of free RAM" warning.
 *
 * Users regularly start an on-device chat with a handful of apps open and almost no free memory,
 * the OS then kills AnythingLLM mid-reply to reclaim it and it looks like we crashed. `memoryFit`
 * only answers "can this phone ever run the model" from total RAM - this answers "is there room
 * right now" from the live free-memory figure.
 */

export type SystemMemory = {
  /** Total physical RAM in bytes */
  total: number;
  /** RAM the OS can hand out right now without killing anything (Android: free + reclaimable cache, iOS: what this process may still allocate) */
  available: number;
  /** Android's own "the system is low on memory" flag (always false on iOS) */
  lowMemory: boolean;
};

export type LowMemoryStatus = SystemMemory & {
  /** What a chat with this model needs in total - see `estimateChatMemory` */
  estimate: ChatMemoryEstimate;
  /** Whether the model is already in memory - its RAM is then no longer counted as available */
  loaded: boolean;
};

/**
 * Once the model is resident its weights, KV cache and compute buffers are already allocated, so
 * only a small floor is needed - below it the OS is likely to start evicting us.
 */
const LOADED_MIN_FREE_BYTES = 0.5e9;
/** Session key so the send-time alert only shows once per app launch - the chip triangle stays for reference. */
const ALERT_SHOWN_SESSION_KEY = '@lowMemoryAlertShown';
/** Dev-only testing aid: set to true to force the warning + chip triangle on any device. */
const FORCE_LOW_MEMORY_WARNING = __DEV__ && false;

export async function getSystemMemory(): Promise<SystemMemory | null> {
  try {
    const info = await NativeModules.DeviceInfoModule?.getMemoryInfo?.();
    if (!info?.total || typeof info.available !== 'number') return null;
    return { total: info.total, available: info.available, lowMemory: !!info.lowMemory };
  } catch {
    return null;
  }
}

/**
 * Returns the memory picture when an on-device model is at risk of being evicted, otherwise null.
 * Null is also returned when we cannot tell (non on-device provider, no model, native call failed)
 * so we never warn on a guess.
 */
export async function getLowMemoryStatus(provider: unknown): Promise<LowMemoryStatus | null> {
  if (!(provider instanceof OnDeviceProvider)) return null;
  const [memory, profile] = await Promise.all([getSystemMemory(), provider.memoryProfile()]);
  if (!memory || !profile?.estimate.weights) {
    console.log('[LowMemory] Cannot assess memory', { memory, profile });
    return null;
  }

  const { estimate } = profile;
  const required = profile.loaded ? LOADED_MIN_FREE_BYTES : estimate.total;
  const isLow = memory.lowMemory || memory.available < required;
  // TODO: remove before release - temporary logging while tuning the thresholds.
  const mb = (bytes: number) => `${Math.round(bytes / 1e6)}MB`;
  console.log(
    `[LowMemory] available=${mb(memory.available)} total=${mb(memory.total)} loaded=${profile.loaded} ` +
    `required=${mb(required)} osLowMemory=${memory.lowMemory} isLow=${isLow} forced=${FORCE_LOW_MEMORY_WARNING} | ` +
    `estimate=${mb(estimate.total)} (weights=${mb(estimate.weights)} mmproj=${mb(estimate.mmproj)} ` +
    `kv=${mb(estimate.kvCache)} compute=${mb(estimate.compute)} margin=${mb(estimate.margin)} fromMetadata=${estimate.fromMetadata})`,
  );
  if (!isLow && !FORCE_LOW_MEMORY_WARNING) return null;
  return { ...memory, ...profile };
}

/** Copy for `LowMemoryModal` (send-time warning and chip popover). */
export function describeLowMemory(status: LowMemoryStatus) {
  return {
    title: i18n.t('models.low_memory.title'),
    advice: i18n.t('models.low_memory.advice'),
    stats: {
      free: formatBytes(status.available, 1),
      total: formatBytes(status.total, 1),
      model: formatBytes(status.estimate.total, 1),
    },
  };
}

/**
 * Called right before an on-device prompt is sent. Returns the memory picture the first time it is
 * low in this app launch (the caller shows `LowMemoryModal`), and null every other time.
 */
export async function claimLowMemoryWarning(provider: unknown): Promise<LowMemoryStatus | null> {
  if (uiStore.session.has(ALERT_SHOWN_SESSION_KEY)) return null;
  const status = await getLowMemoryStatus(provider);
  if (!status) return null;
  uiStore.setSessionKey(ALERT_SHOWN_SESSION_KEY, true);
  return status;
}
