/**
 * Android keeps on-device models loaded while the app is in the background - their own idle
 * timers unload them (5 minutes for chat, 3 for the embedder), and generation keeps going.
 * @see useReleaseModelsInBackground.ios.ts
 */
export default function useReleaseModelsInBackground() {}
