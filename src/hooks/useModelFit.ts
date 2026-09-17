import { useCallback, useMemo } from 'react';
import {
  DeviceMemory,
  FitCandidate,
  getDeviceMemory,
  MemoryFit,
  memoryFitForSize,
  pickRecommendedModel,
} from '@/utils/models/memoryFit';

/**
 * Device-memory verdicts for a list of on-device models.
 *
 * - `fitFor(model)` badges any row (catalog, preset, imported, HF quant)
 * - `recommendedId` is the `id` of the candidate to call out as the best pick for
 *   this phone. Pass the presets as candidates so the alias row gets the badge and
 *   not the catalog row that shares its `modelId`.
 */
export default function useModelFit<T extends FitCandidate>(candidates: T[] = []) {
  const memory: DeviceMemory | null = useMemo(getDeviceMemory, []);

  const fitFor = useCallback(
    (model: { size?: number | string | null }): MemoryFit | null => memoryFitForSize(model.size, memory),
    [memory],
  );

  const recommended = useMemo(() => pickRecommendedModel(candidates, memory), [candidates, memory]);

  return {
    memory,
    fitFor,
    recommended,
    recommendedId: recommended?.id ?? null,
  };
}
