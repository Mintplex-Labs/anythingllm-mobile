import DeviceInfo from 'react-native-device-info';

/**
 * llama.rn load options on iOS, shared by every on-device model (chat, embedder, rerankers).
 *
 * On a device every layer is offloaded to Metal. llama.cpp has no working Metal backend in the simulator,
 * so it stays on the CPU there. mlock is off because iOS caps how much memory an app may wire; mmap'd
 * weights stay resident while they are in use anyway.
 * @see runtime.ts
 */
export const NATIVE_RUNTIME_OPTIONS = {
  use_mlock: false,
  n_gpu_layers: DeviceInfo.isEmulatorSync() ? 0 : 99,
};
