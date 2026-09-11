import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, Text, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Check } from 'phosphor-react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { hapticOptions } from '@/utils/clipboard';

const FILL_COLORS = ['#1f7a52', '#2ea86f', '#6ce9a6'];
const SHIMMER_COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'];
const SHIMMER_PERIOD_MS = 1600;
const GLOW_PERIOD_MS = 1400;
const FILL_EASE_MS = 650;

/**
 * Turns the whole card into the progress indicator while a model downloads.
 * Renders behind the card content (absolute, clipped by the parent's radius):
 *  - a gradient fill that glides to the latest `progress` instead of jumping
 *  - a shimmer band that keeps sweeping across the filled portion so the card
 *    reads as "alive" even between progress ticks
 *  - a breathing glow on the edge of the fill
 * When `progress` reaches 100 it flashes to full brightness and fires a success
 * haptic - the parent is expected to swap to its installed state shortly after.
 */
export function DownloadSurface({
  progress,
  active,
  borderRadius = 12,
  style,
}: {
  progress: number;
  active: boolean;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0); // 0..1 of card width
  const shimmer = useSharedValue(0); // 0..1 sweep position
  const glow = useSharedValue(0); // 0..1 breathing
  const flash = useSharedValue(0); // 0..1 completion flash

  useEffect(() => {
    if (!active) {
      cancelAnimation(shimmer);
      cancelAnimation(glow);
      fill.value = 0;
      flash.value = 0;
      return;
    }
    shimmer.value = 0;
    shimmer.value = withRepeat(
      withTiming(1, { duration: SHIMMER_PERIOD_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: GLOW_PERIOD_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: GLOW_PERIOD_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(shimmer);
      cancelAnimation(glow);
    };
  }, [active, shimmer, glow, fill, flash]);

  useEffect(() => {
    if (!active) return;
    const target = Math.max(0, Math.min(100, progress)) / 100;
    // Never animate backwards - the file system can report a smaller value on a
    // retried chunk and a bar that retreats reads as a failure.
    if (target >= fill.value) {
      fill.value = withTiming(target, { duration: FILL_EASE_MS, easing: Easing.out(Easing.cubic) });
    }
    if (progress >= 100) {
      ReactNativeHapticFeedback.trigger('notificationSuccess', hapticOptions);
      flash.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(160, withTiming(0, { duration: 500 })),
      );
    }
  }, [progress, active, fill, flash]);

  const fillStyle = useAnimatedStyle(() => ({
    width: width * fill.value,
    // Slightly stronger fill while the glow breathes in, full-bright on completion.
    opacity: interpolate(glow.value, [0, 1], [0.82, 0.95]) + flash.value * 0.05,
  }));

  const edgeStyle = useAnimatedStyle(() => ({
    left: width * fill.value - 14,
    opacity: interpolate(glow.value, [0, 1], [0.35, 0.9]),
  }));

  // The shimmer band is as wide as the card and slides across the filled area only.
  const shimmerStyle = useAnimatedStyle(() => {
    const fillWidth = width * fill.value;
    return {
      width: fillWidth,
      opacity: fillWidth > 24 ? 1 : 0,
    };
  });
  const shimmerBandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-width, width]) }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius, overflow: 'hidden' }, style]}
    >
      {active && width > 0 && (
        <>
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0 }, fillStyle]}>
            <LinearGradient
              colors={FILL_COLORS}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' }, shimmerStyle]}>
            <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width }, shimmerBandStyle]}>
              <LinearGradient
                colors={SHIMMER_COLORS}
                locations={[0.2, 0.5, 0.8]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </Animated.View>
          {/* Soft leading edge so the fill boundary glows instead of being a hard cut */}
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 28 }, edgeStyle]}>
            <LinearGradient
              colors={['rgba(108,233,166,0)', 'rgba(108,233,166,0.9)', 'rgba(108,233,166,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
          <Animated.View
            style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#6ce9a6' }, flashStyle]}
          />
        </>
      )}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Compact circular progress indicator: the ring stroke fills clockwise from the
 * top as `progress` climbs and closes into a full circle at 100, at which point
 * the number inside swaps to a springing check mark and a success haptic fires.
 * Intended for list rows where a full-card fill would be too loud.
 */
export function DownloadRing({
  progress,
  size = 40,
  strokeWidth = 3,
  trackColor = 'rgba(255,255,255,0.12)',
  color = '#6ce9a6',
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const done = progress >= 100;
  const fill = useSharedValue(0); // 0..1
  const checkScale = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, progress)) / 100;
    if (target >= fill.value) {
      fill.value = withTiming(target, { duration: FILL_EASE_MS, easing: Easing.out(Easing.cubic) });
    }
  }, [progress, fill]);

  useEffect(() => {
    if (done) {
      ReactNativeHapticFeedback.trigger('notificationSuccess', hapticOptions);
      // Let the ring close before the check pops in.
      checkScale.value = withDelay(FILL_EASE_MS * 0.6, withSpring(1, { damping: 12, stiffness: 220 }));
    } else {
      checkScale.value = 0;
    }
  }, [done, checkScale]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.value),
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - checkScale.value }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={ringProps}
        />
      </Svg>
      <Animated.Text
        style={[{ color: '#ffffff', fontSize: size * 0.26, fontWeight: '600', fontVariant: ['tabular-nums'] }, labelStyle]}
      >
        {Math.round(Math.min(progress, 100))}
      </Animated.Text>
      <Animated.View style={[{ position: 'absolute' }, checkStyle]}>
        <Check size={size * 0.45} color={color} weight="bold" />
      </Animated.View>
    </View>
  );
}

/**
 * Right-hand status for a downloading card: the percentage, which swaps to a
 * springing check mark the moment the download completes.
 */
export function DownloadStatus({ progress, size = 'sm' }: { progress: number; size?: 'sm' | 'lg' }) {
  const done = progress >= 100;
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = done ? withSpring(1, { damping: 12, stiffness: 220 }) : 0;
  }, [done, scale]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (done) {
    return (
      <Animated.View
        style={[
          { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
          checkStyle,
        ]}
      >
        <Check size={16} color="#ffffff" weight="bold" />
      </Animated.View>
    );
  }
  return (
    <Text
      style={{ fontVariant: ['tabular-nums'] }}
      className={`text-white font-semibold ${size === 'lg' ? 'text-base' : 'text-xs'} min-w-[36px] text-right`}
    >
      {Math.round(progress)}%
    </Text>
  );
}
