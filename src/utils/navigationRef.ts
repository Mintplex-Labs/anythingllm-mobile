import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * App-wide handle on the root navigator for code that runs outside the React tree
 * (notification taps, deep links). Attach it to `<NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>`.
 */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

let pending: { name: string; params?: object; reset: boolean } | null = null;

function perform({ name, params, reset }: { name: string; params?: object; reset: boolean }) {
  if (reset) navigationRef.reset({ index: 0, routes: [{ name, params }] });
  else navigationRef.navigate(name, params);
}

/**
 * Navigate now if the navigator is mounted, otherwise remember the request and replay it in
 * `flushPendingNavigation` once it is. Only the latest request is kept - a tap that arrives
 * during the splash screen should win over anything older.
 */
export function navigateWhenReady(name: string, params?: object) {
  const request = { name, params, reset: false };
  if (navigationRef.isReady()) return perform(request);
  pending = request;
}

/**
 * Like `navigateWhenReady` but replaces the stack with the route, the way the sidebar switches
 * threads. Use it when the target screen may already be showing with other params and must mount
 * fresh (eg: opening a new thread from shared content).
 */
export function resetToWhenReady(name: string, params?: object) {
  const request = { name, params, reset: true };
  if (navigationRef.isReady()) return perform(request);
  pending = request;
}

/** Wire to `NavigationContainer.onReady`. */
export function flushPendingNavigation() {
  if (!pending || !navigationRef.isReady()) return;
  const request = pending;
  pending = null;
  perform(request);
}
