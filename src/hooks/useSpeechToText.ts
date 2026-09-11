import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import Voice, {
    SpeechResultsEvent,
    SpeechErrorEvent,
    SpeechEndEvent,
    SpeechVolumeChangeEvent,
} from '@react-native-voice/voice';

export interface SpeechToTextInterface {
    isListening: boolean;
    /**
     * Normalized input loudness in [0, 1], updated on the UI thread as the OS
     * reports microphone levels. Read it from a reanimated worklet so the
     * waveform can react without re-rendering React on every sample.
     */
    volume: SharedValue<number>;
    startListening: () => Promise<void>;
    stopListening: () => Promise<void>;
    toggleListening: () => Promise<void>;
}

async function ensureMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
            title: 'Microphone access',
            message: 'AnythingLLM needs microphone access to transcribe your speech into a prompt.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
        },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Android reports RMS in dB, typically -2..10. iOS reports a value the lib
 * already normalizes to 0..10. Collapse both into [0, 1].
 */
function normalizeVolume(raw: number): number {
    const scaled = Platform.OS === 'android' ? (raw + 2) / 12 : raw / 10;
    return Math.min(1, Math.max(0, scaled));
}

export default function useSpeechToText(
    onTranscript: (text: string) => void,
): SpeechToTextInterface {
    const [isListening, setIsListening] = useState(false);
    const volume = useSharedValue(0);
    const onTranscriptRef = useRef(onTranscript);
    onTranscriptRef.current = onTranscript;

    useEffect(() => {
        // Both events carry the cumulative best transcription for the session,
        // so each one can replace the prompt wholesale. Android streams interim
        // text via partial results and sends a final onSpeechResults; iOS sends
        // onSpeechResults continuously and its partials are non-string objects.
        function onSpeechResults(e: SpeechResultsEvent) {
            const text = e.value?.[0];
            if (typeof text === 'string' && text) onTranscriptRef.current(text);
        }

        function onSpeechEnd(_e: SpeechEndEvent) {
            volume.value = 0;
            setIsListening(false);
        }

        function onSpeechError(e: SpeechErrorEvent) {
            volume.value = 0;
            setIsListening(false);
            const code = e.error?.code;
            // "no-speech" / code 6 on Android means silence — not a real error
            if (code === '6' || code === 'no-speech') return;
            // "recognition busy" / code 8 means another recognizer is active
            if (code === '8' || code === 'recognition-busy') return;
            console.warn('[STT] error', e.error);
        }

        function onSpeechVolumeChanged(e: SpeechVolumeChangeEvent) {
            if (typeof e.value === 'number') volume.value = normalizeVolume(e.value);
        }

        Voice.onSpeechResults = onSpeechResults;
        Voice.onSpeechPartialResults = onSpeechResults;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechError = onSpeechError;
        Voice.onSpeechVolumeChanged = onSpeechVolumeChanged;

        return () => {
            Voice.destroy().then(Voice.removeAllListeners);
        };
    }, []);

    const startListening = useCallback(async () => {
        const hasPermission = await ensureMicPermission();
        if (!hasPermission) {
            Alert.alert(
                'Microphone access required',
                'Enable microphone access in your device settings to use speech-to-text.',
            );
            return;
        }

        try {
            await Voice.start('en-US');
            setIsListening(true);
        } catch (err) {
            console.warn('[STT] failed to start', err);
            setIsListening(false);
        }
    }, []);

    const stopListening = useCallback(async () => {
        try {
            await Voice.stop();
        } catch {
            // already stopped
        }
        volume.value = 0;
        setIsListening(false);
    }, []);

    const toggleListening = useCallback(async () => {
        if (isListening) {
            await stopListening();
        } else {
            await startListening();
        }
    }, [isListening, startListening, stopListening]);

    return { isListening, volume, startListening, stopListening, toggleListening };
}
