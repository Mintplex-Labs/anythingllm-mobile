/**
 * llama.rn load options that differ per platform, shared by every on-device model (chat, embedder, rerankers).
 *
 * Android runs everything on the CPU. The Hexagon NPU / OpenCL backends in llama.cpp are experimental and
 * slower than the CPU path on the phones we target, so we never offload layers.
 * @see runtime.ios.ts
 */
export const NATIVE_RUNTIME_OPTIONS = {
  use_mlock: true,
  n_gpu_layers: 0,
};
