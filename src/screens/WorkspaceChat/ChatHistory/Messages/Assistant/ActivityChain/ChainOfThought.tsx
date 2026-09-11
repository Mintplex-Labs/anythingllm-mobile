import { createContext, memo, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import { Brain, CaretRight } from "phosphor-react-native";
import ShimmerText from "./ShimmerText";

/**
 * Native port of the desktop `ChainOfThought` primitives
 * (frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/ChainOfThought).
 * A collapsible header followed by a vertical rail of steps.
 */

export const CHAIN_COLORS = {
    /** zinc-400 - resting header + completed steps */
    muted: '#A1A1AA',
    /** zinc-50 - the step currently doing work */
    active: '#FAFAFA',
    /** zinc-400 @ 50% - steps that have not started */
    pending: 'rgba(161,161,170,0.5)',
    /** zinc-800 - the rail joining steps */
    rail: '#27272A',
    /** zinc-500 - the dim end of the header shimmer */
    shimmerDim: '#71717A',
    /** zinc-100 - the bright band of the header shimmer */
    shimmerBright: '#F4F4F5',
} as const;

const STEP_STATUS_COLORS = {
    complete: CHAIN_COLORS.muted,
    active: CHAIN_COLORS.active,
    pending: CHAIN_COLORS.pending,
} as const;

/** text-sm / leading-5 */
export const CHAIN_TEXT: TextStyle = { fontSize: 14, lineHeight: 20 };
/** text-xs */
export const CHAIN_SMALL_TEXT: TextStyle = { fontSize: 12, lineHeight: 16 };

const STEP_GAP = 12;
const MARKER_SIZE = 16;
const ICON_SIZE = 16;

type ChainContext = {
    isOpen: boolean;
    setIsOpen: (next: boolean) => void;
    disabled: boolean;
}
const ChainOfThoughtContext = createContext<ChainContext | null>(null);

function useChainOfThought() {
    const context = useContext(ChainOfThoughtContext);
    if (!context) throw new Error("ChainOfThought components must be used within ChainOfThought");
    return context;
}

/**
 * @param open - controlled open state
 * @param defaultOpen - uncontrolled initial open state
 * @param disabled - header cannot be toggled (eg: nothing to expand yet)
 */
export function ChainOfThought({
    open,
    defaultOpen = false,
    onOpenChange,
    disabled = false,
    style,
    children,
}: {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    children: ReactNode;
}) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const isOpen = open ?? uncontrolledOpen;

    const value = useMemo<ChainContext>(() => ({
        isOpen,
        disabled,
        setIsOpen: (next) => {
            setUncontrolledOpen(next);
            onOpenChange?.(next);
        },
    }), [isOpen, disabled, onOpenChange]);

    return (
        <ChainOfThoughtContext.Provider value={value}>
            <View style={[{ width: '100%', gap: 8, marginVertical: 4 }, style]}>{children}</View>
        </ChainOfThoughtContext.Provider>
    );
}

/**
 * @param icon - leading indicator, defaults to a brain glyph
 * @param pending - sweeps a shine across the label while work is in flight
 */
export function ChainOfThoughtHeader({
    icon,
    pending = false,
    label,
}: {
    icon?: ReactNode;
    pending?: boolean;
    label: string;
}) {
    const { isOpen, setIsOpen, disabled } = useChainOfThought();
    const rotation = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
    const [pressed, setPressed] = useState(false);

    useEffect(() => {
        Animated.timing(rotation, { toValue: isOpen ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    }, [isOpen, rotation]);

    const color = pressed ? CHAIN_COLORS.active : CHAIN_COLORS.muted;
    const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen, disabled }}
            disabled={disabled}
            onPress={() => setIsOpen(!isOpen)}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}
        >
            <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                {icon ?? <Brain size={20} color={color} />}
            </View>
            {/*
              The caret sits next to the label rather than at the container edge;
              the label still shrinks and truncates when the row runs out of room.
            */}
            <ShimmerText
                active={pending}
                style={[CHAIN_TEXT, { flexShrink: 1 }]}
                dimColor={pending ? CHAIN_COLORS.shimmerDim : color}
                brightColor={CHAIN_COLORS.shimmerBright}
            >
                {label}
            </ShimmerText>
            {!disabled && (
                <Animated.View style={{ transform: [{ rotate }] }}>
                    <CaretRight size={12} color={color} weight="bold" />
                </Animated.View>
            )}
        </Pressable>
    );
}

/**
 * Fades + slides a step in when it first appears (desktop `animate-in`).
 */
function StepEnter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }, [progress]);
    const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
    return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export type ChainStepStatus = keyof typeof STEP_STATUS_COLORS;

/**
 * One row on the rail.
 * @param icon - phosphor icon component for the marker, defaults to a dot
 * @param label - keep this a string where possible so the memo can skip unchanged steps
 * @param description - small muted text under the label (eg: a duration)
 * @param isLast - hides the rail segment below this step
 */
export const ChainOfThoughtStep = memo(function ChainOfThoughtStep({
    icon: Icon,
    label,
    description,
    status = 'complete',
    isLast = false,
    children,
}: {
    icon?: React.ComponentType<{ size?: number; color?: string; weight?: any }>;
    label: ReactNode;
    description?: ReactNode;
    status?: ChainStepStatus;
    isLast?: boolean;
    children?: ReactNode;
}) {
    const color = STEP_STATUS_COLORS[status];
    return (
        <StepEnter style={{ flexDirection: 'row', gap: 8, position: 'relative' }}>
            {/*
              Rail segment spanning the gap to the next step. Anchored to the row so it
              has height to fill; reaches past the gap plus half a marker so it meets the
              next marker instead of stopping short.
            */}
            {!isLast && (
                <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: MARKER_SIZE / 2 - 0.5, top: 15, bottom: -(STEP_GAP + 6.5), width: 1, backgroundColor: CHAIN_COLORS.rail }}
                />
            )}
            {/* 20px tall to match the text line height so the marker centers on the first line */}
            <View style={{ width: MARKER_SIZE, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                {Icon ? (
                    <Icon size={ICON_SIZE} color={color} />
                ) : (
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity: 0.6 }} />
                )}
            </View>
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
                {typeof label === 'string' ? <Text style={[CHAIN_TEXT, { color }]}>{label}</Text> : label}
                {description ? (
                    typeof description === 'string'
                        ? <Text style={[CHAIN_SMALL_TEXT, { color: CHAIN_COLORS.muted }]}>{description}</Text>
                        : description
                ) : null}
                {children}
            </View>
        </StepEnter>
    );
});

export function ChainOfThoughtContent({ children }: { children: ReactNode }) {
    const { isOpen } = useChainOfThought();
    if (!isOpen) return null;
    return <View style={{ gap: STEP_GAP, marginTop: 4, paddingRight: 8 }}>{children}</View>;
}
