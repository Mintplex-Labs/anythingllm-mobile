import { useEffect } from 'react';
import { AppState } from 'react-native';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import OnDeviceEmbedderProvider from '@/utils/Embedder/onDevice';

/**
 * Unloads the on-device chat model and embedder as soon as the app goes to the background.
 *
 * iOS suspends the app shortly after, which freezes the idle timers that would otherwise unload
 * them, so they would sit in memory until iOS kills the app to reclaim it. Apps may not submit
 * GPU (Metal) work in the background either, so a reply still generating is stopped here and
 * kept as far as it got, the same as tapping stop. Both load again on the next request.
 * @see useReleaseModelsInBackground.ts
 */
export default function useReleaseModelsInBackground() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'background') return;
      OnDeviceProvider.instance?.unloadModel().catch(error => console.log('[ReleaseModels] chat model unload failed', error));
      OnDeviceEmbedderProvider.instance?.cleanup().catch(error => console.log('[ReleaseModels] embedder unload failed', error));
    });
    return () => subscription.remove();
  }, []);
}
