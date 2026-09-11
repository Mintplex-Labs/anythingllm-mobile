import React from 'react';
import { View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MIN_HEIGHT = 6;
const MAX_HEIGHT = 20;
// Per-bar gain so the bars fan out unevenly instead of moving as one block.
const BAR_GAINS = [0.7, 1.4, 1.0, 0.55];
// How quickly a bar chases a new level. Volume samples arrive every ~50-100ms.
const SETTLE_MS = 90;

interface WaveBarProps {
    volume: SharedValue<number>;
    gain: number;
}

function WaveBar({ volume, gain }: WaveBarProps) {
    const animatedStyle = useAnimatedStyle(() => {
        const level = Math.min(1, volume.value * gain);
        const target = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * level;
        return {
            height: withTiming(target, { duration: SETTLE_MS }),
            width: BAR_WIDTH,
            borderRadius: BAR_WIDTH / 2,
            backgroundColor: '#46C8FF',
        };
    });

    return <Animated.View style={animatedStyle} />;
}

interface VoiceRecordingIndicatorProps {
    /** Normalized mic level in [0, 1]; see `useSpeechToText().volume`. */
    volume: SharedValue<number>;
}

/**
 * Live waveform driven by microphone level. Bars sit at their minimum height
 * while listening in silence and grow with input loudness, so the user can
 * see the recognizer is actually hearing them.
 */
export default function VoiceRecordingIndicator({ volume }: VoiceRecordingIndicatorProps) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BAR_GAP, height: 25 }}>
            {BAR_GAINS.map((gain, i) => (
                <WaveBar key={i} volume={volume} gain={gain} />
            ))}
        </View>
    );
}
