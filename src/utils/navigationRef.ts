import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * App-wide handle on the root navigator for code that runs outside the React tree
 * (notification taps, deep links). Attach it to `<NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>`.
 */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

let pending: { name: string; params?: object } | null = null;

/**
 * Navigate now if the navigator is mounted, otherwise remember the request and replay it in
 * `flushPendingNavigation` once it is. Only the latest request is kept - a tap that arrives
 * during the splash screen should win over anything older.
 */
export function navigateWhenReady(name: string, params?: object) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return;
  }
  pending = { name, params };
}

/** Wire to `NavigationContainer.onReady`. */
export function flushPendingNavigation() {
  if (!pending || !navigationRef.isReady()) return;
  const { name, params } = pending;
  pending = null;
  navigationRef.navigate(name, params);
}
