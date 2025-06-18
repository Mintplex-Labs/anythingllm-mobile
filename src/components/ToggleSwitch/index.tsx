import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, Pressable, Easing } from "react-native";

interface ToggleSwitchProps {
    isOn: boolean;
    onToggle: () => void;
    inactiveBgColor?: string;
    activeBgColor?: string;
    size?: "default" | "large";
}

const SIZE_MAP = {
    default: {
        width: 40,
        height: 20.5,
        wheelSize: 15,
    },
    large: {
        width: 52,
        height: 32.7,
        wheelSize: 28.5,
    },
}

const noop = () => { };
export default function ToggleSwitch({
    isOn,
    onToggle = noop,
    inactiveBgColor = "#7d7d7d",
    activeBgColor = "#34c759",
    size = "default",
}: ToggleSwitchProps) {
    const animatedValue = useRef(new Animated.Value(0));
    const colorAnimatedValue = useRef(new Animated.Value(0));
    const circleWidthAnimatedValue = useRef(new Animated.Value(0));
    const translateX = useRef(new Animated.Value(0));

    useEffect(() => {
        Animated.timing(animatedValue.current, {
            toValue: isOn ? 1 : 0,
            duration: 110,
            easing: Easing.linear,
            useNativeDriver: false,
        }).start();

        Animated.timing(colorAnimatedValue.current, {
            toValue: isOn ? 1 : 0,
            duration: 300,
            easing: Easing.linear,
            useNativeDriver: false,
        }).start();
    }, [isOn]);

    const onTouchStart = () => {
        Animated.timing(circleWidthAnimatedValue.current, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false,
        }).start();
        if (isOn)
            Animated.timing(translateX.current, {
                toValue: -7,
                duration: 200,
                useNativeDriver: false,
            }).start();
    };

    const onTouchEnd = () => {
        Animated.timing(circleWidthAnimatedValue.current, {
            toValue: 0,
            duration: 100,
            useNativeDriver: false,
        }).start();
        Animated.timing(translateX.current, {
            toValue: 0,
            duration: 100,
            useNativeDriver: false,
        }).start();
    };

    const moveToggle = useMemo(
        () =>
            animatedValue.current.interpolate({
                inputRange: [0, 1],
                outputRange: [2.3, 22],
            }),
        []
    );

    const circleWidth = useMemo(
        () =>
            circleWidthAnimatedValue.current.interpolate({
                inputRange: [0, 1],
                outputRange: [SIZE_MAP[size].wheelSize, SIZE_MAP[size].wheelSize * 1.5],
            }),
        []
    );

    const bgColor = colorAnimatedValue.current.interpolate({
        inputRange: [0, 1],
        outputRange: [inactiveBgColor, activeBgColor],
    });

    return (
        <View style={defaultStyles.container}>
            <Pressable
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onPress={onToggle}
            >
                <Animated.View
                    style={[
                        defaultStyles.toggleContainer,
                        {
                            backgroundColor: bgColor,
                            width: SIZE_MAP[size].width,
                            height: SIZE_MAP[size].height,
                        },
                    ]}
                >
                    <Animated.View
                        style={[
                            defaultStyles.toggleWheelStyle,
                            {
                                marginLeft: moveToggle,
                                width: circleWidth,
                                height: SIZE_MAP[size].wheelSize,
                                transform: [{ translateX: translateX.current }, { translateY: -0.4 }],
                            },
                        ]}
                    />
                </Animated.View>
            </Pressable>
        </View>
    );
};

const defaultStyles = StyleSheet.create({
    container: { display: "flex", justifyContent: "space-between" },
    toggleContainer: {
        borderRadius: 4000,
        justifyContent: "center",
    },
    toggleWheelStyle: {
        backgroundColor: "#ffffff",
        borderRadius: 200,
        shadowColor: "#515151",
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.2,
        shadowRadius: 2.5,
        elevation: 1.5,
    },
});