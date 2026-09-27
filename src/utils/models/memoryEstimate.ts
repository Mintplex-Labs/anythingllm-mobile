import { addNativeLogListener, loadLlamaModelInfo, toggleNativeLog } from 'llama.rn';

/**
 * Estimates how much RAM an on-device chat needs, per model, before anything is loaded.
 *
 *   total = weights + vision projector + KV cache + compute buffers + margin
 *
 * Weights are the GGUF file (mmap + mlock keeps all of it resident). The KV cache and compute
 * buffers are derived from the GGUF header, which is why a 1B Gemma (1 KV head) and a 1.7B Qwen
 * (8 KV heads) need very different headroom despite similar file sizes. Where we have to guess
 * (vocab size, sliding-window layers, vision encoder) we round up, so this errs on the high side.
 */

export type GgufShape = {
  arch: string;
  nLayer: number;
  /** KV heads per layer - 0 for recurrent/linear-attention layers in hybrid models, which have no KV cache */
  kvHeadsPerLayer: number[];
  /** Largest attention head count across layers (drives the attention score buffer) */
  maxHeads: number;
  headDimK: number;
  headDimV: number;
  nEmbd: number;
  /** Largest feed-forward width across layers */
  maxFf: number;
  nVocab: number;
};

export type ChatMemoryEstimate = {
  weights: number;
  mmproj: number;
  kvCache: number;
  compute: number;
  margin: number;
  total: number;
  /** False when the GGUF header could not be read and a flat reserve was used instead */
  fromMetadata: boolean;
};

/** F16 - `createContext` does not set cache_type_k/v so llama.cpp uses its default. */
const KV_BYTES_PER_VALUE = 2;
/** Vision encoder activations while an image is processed, on top of the projector weights. Rough upper bound. */
const VISION_COMPUTE_BYTES = 150e6;
/** Share added on top for allocator slack, the llama.rn runtime and the JS side of a chat. */
const MARGIN_RATIO = 0.1;
/** Used instead of KV + compute when the header cannot be read. */
const FALLBACK_RESERVE_BYTES = 0.75e9;

/**
 * The tokenizer arrays are stripped by llama.rn's `loadLlamaModelInfo`, so the vocab size is not
 * in the metadata. Known families first, then a default at the large end of common models.
 */
const VOCAB_BY_ARCH_PREFIX: [string, number][] = [
  ['gemma', 262_144],
  ['command-r', 256_000],
  ['cohere', 256_000],
  ['qwen', 151_936],
  ['llama', 128_256],
  ['lfm', 65_536],
  ['granite', 100_352],
  ['phi', 100_352],
  ['smollm', 49_152],
];
const DEFAULT_VOCAB = 152_000;

/** GGUF values arrive as strings; per-layer arrays look like "[0, 0, 8, 8]". */
function parseNumbers(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  const text = String(value).trim();
  const parts = text.startsWith('[') ? text.slice(1, -1).split(',') : [text];
  return parts.map(part => Number(part.trim())).filter(Number.isFinite);
}

function perLayer(values: number[], nLayer: number, fallback: number): number[] {
  if (values.length === nLayer) return values;
  const single = values.length ? values[0] : fallback;
  return Array.from({ length: nLayer }, () => single);
}

const shapeCache = new Map<string, Promise<GgufShape | null>>();

/** Reads (and caches per file) the architecture numbers we need from the GGUF header. Null when unreadable. */
export function readGgufShape(path: string): Promise<GgufShape | null> {
  if (!shapeCache.has(path)) {
    shapeCache.set(path, (async () => {
      try {
        const info = (await loadLlamaModelInfo(path)) as Record<string, unknown>;
        const arch = String(info['general.architecture'] || '');
        if (!arch) return null;
        const key = (name: string) => info[`${arch}.${name}`];

        const nLayer = parseNumbers(key('block_count'))[0];
        const nEmbd = parseNumbers(key('embedding_length'))[0];
        const heads = parseNumbers(key('attention.head_count'));
        if (!nLayer || !nEmbd || !heads.length) return null;

        const maxHeads = Math.max(...heads);
        const kvHeads = parseNumbers(key('attention.head_count_kv'));
        const headDimK = parseNumbers(key('attention.key_length'))[0] || Math.round(nEmbd / maxHeads);
        const headDimV = parseNumbers(key('attention.value_length'))[0] || headDimK;
        const ff = parseNumbers(key('feed_forward_length'));
        const vocab = parseNumbers(key('vocab_size'))[0]
          || VOCAB_BY_ARCH_PREFIX.find(([prefix]) => arch.startsWith(prefix))?.[1]
          || DEFAULT_VOCAB;

        return {
          arch,
          nLayer,
          kvHeadsPerLayer: perLayer(kvHeads, nLayer, maxHeads),
          maxHeads,
          headDimK,
          headDimV,
          nEmbd,
          maxFf: ff.length ? Math.max(...ff) : nEmbd * 4,
          nVocab: vocab,
        };
      } catch {
        return null;
      }
    })());
  }
  return shapeCache.get(path)!;
}

/**
 * RAM needed to load the model and run a chat with the given context window.
 *
 * - KV cache: K and V for every token of the window on every attention layer. Sliding-window
 *   layers (Gemma) are counted at full length - an overestimate, never an under.
 * - Compute: llama.cpp reserves its scratch buffer for a worst-case batch of `nUbatch` tokens that
 *   all produce logits (vocab x batch floats - usually the largest piece), plus the larger of the
 *   attention scores (no flash attention) and the FFN activations, plus a few hidden-state copies.
 */
export function estimateChatMemory({
  weightsBytes,
  mmprojBytes,
  shape,
  nCtx,
  nUbatch,
}: {
  weightsBytes: number;
  mmprojBytes: number;
  shape: GgufShape | null;
  nCtx: number;
  nUbatch: number;
}): ChatMemoryEstimate {
  const vision = mmprojBytes ? mmprojBytes + VISION_COMPUTE_BYTES : 0;

  if (!shape) {
    const subtotal = weightsBytes + vision + FALLBACK_RESERVE_BYTES;
    return {
      weights: weightsBytes,
      mmproj: vision,
      kvCache: 0,
      compute: FALLBACK_RESERVE_BYTES,
      margin: 0,
      total: subtotal,
      fromMetadata: false,
    };
  }

  const kvHeadsTotal = shape.kvHeadsPerLayer.reduce((sum, heads) => sum + heads, 0);
  const kvCache = nCtx * KV_BYTES_PER_VALUE * kvHeadsTotal * (shape.headDimK + shape.headDimV);

  const f32 = 4;
  const logits = shape.nVocab * nUbatch * f32;
  const attentionScores = shape.maxHeads * nCtx * nUbatch * f32;
  const ffnActivations = shape.maxFf * nUbatch * f32 * 3;
  const hiddenStates = shape.nEmbd * nUbatch * f32 * 4;
  const compute = logits + Math.max(attentionScores, ffnActivations) + hiddenStates;

  const subtotal = weightsBytes + vision + kvCache + compute;
  const margin = subtotal * MARGIN_RATIO;
  return {
    weights: weightsBytes,
    mmproj: vision,
    kvCache,
    compute,
    margin,
    total: subtotal + margin,
    fromMetadata: true,
  };
}

let allocationLoggingEnabled = false;

/**
 * TODO: remove before release - temporary, for calibrating `estimateChatMemory`.
 * Forwards llama.cpp's own allocation lines (model / KV cache / compute buffer sizes) to the JS
 * console so they show up in logcat next to the `[LowMemory]` estimate. Dev builds only.
 */
export function enableAllocationLogging() {
  if (!__DEV__ || allocationLoggingEnabled) return;
  allocationLoggingEnabled = true;
  toggleNativeLog(true).catch(() => { });
  addNativeLogListener((_level, text) => {
    if (/buffer size|KV self size|kv_cache.*size|llama_kv_cache/i.test(text)) console.log(`[LowMemory:native] ${text.trim()}`);
  });
}
