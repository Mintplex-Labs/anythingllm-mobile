import { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, StyleProp, Text, TextStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import LinearGradient from "react-native-linear-gradient";

const SWEEP_DURATION_MS = 1800;

/**
 * Single-line label that sweeps a highlight across itself once each time its
 * text changes while `active`.
 * Native counterpart of the desktop `animate-shimmer` text - the text is used
 * as an alpha mask over a moving gradient so the shine follows the glyphs.
 * Falls back to a plain `Text` until it has been measured or when idle.
 */
export default function ShimmerText({
    children,
    active,
    style,
    dimColor,
    brightColor,
    numberOfLines = 1,
}: {
    children: string;
    active: boolean;
    style?: StyleProp<TextStyle>;
    dimColor: string;
    brightColor: string;
    numberOfLines?: number;
}) {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const progress = useRef(new Animated.Value(0)).current;

    // One sweep per label. The band travels left-to-right once and parks just past
    // the text, so the label settles to `dimColor` instead of looping forever. A new
    // status message re-arms the sweep because `children` is in the deps.
    useEffect(() => {
        if (!active || size.width === 0) return;
        progress.setValue(0);
        const sweep = Animated.timing(progress, {
            toValue: 1,
            duration: SWEEP_DURATION_MS,
            easing: Easing.linear,
            useNativeDriver: true,
        });
        sweep.start();
        return () => sweep.stop();
    }, [active, size.width, progress, children]);

    const onLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
    };

    // Measured copy - always rendered so the mask has a stable box to fill.
    const sizingText = (
        <Text numberOfLines={numberOfLines} ellipsizeMode="tail" style={[style, { color: dimColor }, active && size.width > 0 ? { opacity: 0 } : null]} onLayout={onLayout}>
            {children}
        </Text>
    );
    if (!active || size.width === 0) return sizingText;

    // Gradient is 3x the text width with the bright band in the middle. Sliding it
    // from -2w to 0 moves the band from just left of the text to just right of it
    // while the dim edges always cover the glyphs, so the label never blinks out.
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-2 * size.width, 0] });

    return (
        <MaskedView
            style={{ flexShrink: 1, height: size.height }}
            maskElement={
                <Text numberOfLines={numberOfLines} ellipsizeMode="tail" style={[style, { color: '#000' }]}>
                    {children}
                </Text>
            }
        >
            {sizingText}
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: size.width * 3, transform: [{ translateX }] }}>
                <LinearGradient
                    colors={[dimColor, brightColor, dimColor]}
                    locations={[0.35, 0.5, 0.65]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={{ flex: 1 }}
                />
            </Animated.View>
        </MaskedView>
    );
}
