import * as ReactNativeFeatureFlags from 'react-native/src/private/featureflags/ReactNativeFeatureFlags';

/**
 * Overrides for React Native's JS feature flags. Must run before anything reads a flag, so index.js
 * imports this first.
 *
 * shouldUseSetNativePropsInFabric: off. With it on, an Animated animation on the JS driver
 * (useNativeDriver: false, or setValue before a native animation starts) updates views through
 * setNativeProps. In React Native 0.81 that writes the node's stored native props on the JS thread with no
 * lock, while Reanimated clones the same node on the UI thread for its animation frames. When the two
 * overlap the clone reads freed memory and the app aborts in folly::dynamic ("Check failed: 0", GH #147).
 * Off, Animated re-renders the component instead, which goes through React's normal commit.
 * React Native fixed the race in 0.86 (facebook/react-native#52646); this can go once we are on it.
 */
try {
  ReactNativeFeatureFlags.override({
    shouldUseSetNativePropsInFabric: () => false,
  });
} catch (error) {
  console.error('Could not override React Native feature flags', error);
}
