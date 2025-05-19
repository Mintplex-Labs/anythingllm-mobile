import {useEffect} from 'react';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';

/**
 * React hook that prevents the screen from going to sleep while the component is mounted.
 *
 * @example
 * ```tsx
 * function VideoPlayer() {
 *   useKeepAwake(); // Screen will stay awake while VideoPlayer is mounted
 *   return <Video source={source} />;
 * }
 * ```
 */
export function useKeepAwake(): void {
  useEffect(() => {
    try {
      activateKeepAwake();
      return () => {
        try {
          deactivateKeepAwake();
        } catch (error) {
          console.error('Failed to deactivate keep awake in cleanup:', error);
        }
      };
    } catch (error) {
      console.error('Failed to activate keep awake:', error);
      // We don't rethrow here as it would crash the component
      // Instead, we log the error and let the screen timeout normally
    }
  }, []);
}
