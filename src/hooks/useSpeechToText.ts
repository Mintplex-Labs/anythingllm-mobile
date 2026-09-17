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

/**
 * How long the user can stay silent (after having said something) before we
 * stop listening on their behalf. Android's recognizer takes this as a hint
 * via the intent extras below; iOS has no equivalent, so we also enforce it
 * ourselves with a timer that resets on every transcript update.
 */
const SILENCE_TIMEOUT_MS = 2_000;

const ANDROID_START_OPTIONS = {
    EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_TIMEOUT_MS,
    EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_TIMEOUT_MS,
    // Android 13+ masks profanity with asterisks by default. The user is
    // dictating their own prompt, so transcribe what they actually said.
    // Forwarded by our patch-package patch of @react-native-voice/voice;
    // the upstream module drops unknown extras.
    EXTRA_MASK_OFFENSIVE_WORDS: false,
};

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
function joinSegments(a: string, b: string): string {
    const left = a.trim();
    const right = b.trim();
    if (!left) return right;
    if (!right) return left;
    return `${left} ${right}`;
}

function words(text: string): string[] {
    return text
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean);
}

/**
 * Decide whether a new result is the recognizer revising the utterance we are
 * currently tracking, or the start of a new one. Android resets its partial
 * text to just the latest phrase whenever it internally finalizes a chunk, and
 * it does not reliably fire onEndOfSpeech first, so this has to be judged from
 * the text alone. A revision re-transcribes the same audio, so it extends what
 * we have, or keeps roughly the same length and opens with the same first or
 * second word (the recognizer often rewrites a leading homophone). A result
 * that drops several words is new speech even if it happens to be a prefix of
 * the old text - "I" after "I want to go to the store" must not collapse it.
 * Anything else is appended, erring toward a duplicated word over lost text.
 */
function isRevisionOf(previous: string, next: string): boolean {
    if (!previous) return true;
    if (next.startsWith(previous)) return true;
    const prev = words(previous);
    const curr = words(next);
    if (prev.length === 0) return true;
    if (curr.length < prev.length - 2) return false;
    if (prev[0] === curr[0]) return true;
    return prev.length > 1 && curr.length > 1 && prev[1] === curr[1];
}

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
    const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Speech the recognizer has moved past and can no longer revise, plus the
    // utterance currently being transcribed. The prompt is always the join of
    // both, so a new utterance can never wipe out earlier ones.
    const committedText = useRef('');
    const segmentText = useRef('');

    const clearSilenceTimer = useCallback(() => {
        if (silenceTimer.current) {
            clearTimeout(silenceTimer.current);
            silenceTimer.current = null;
        }
    }, []);

    const stopListening = useCallback(async () => {
        clearSilenceTimer();
        try {
            await Voice.stop();
        } catch {
            // already stopped
        }
        volume.value = 0;
        setIsListening(false);
    }, [clearSilenceTimer, volume]);

    // (Re)arm the silence countdown. Only called once speech has produced a
    // transcript, so tapping the mic and pausing to think does not self-close.
    const resetSilenceTimer = useCallback(() => {
        clearSilenceTimer();
        silenceTimer.current = setTimeout(() => {
            silenceTimer.current = null;
            stopListening();
        }, SILENCE_TIMEOUT_MS);
    }, [clearSilenceTimer, stopListening]);

    useEffect(() => {
        function applyTranscript(e: SpeechResultsEvent) {
            const raw = e.value?.[0];
            const text = typeof raw === 'string' ? raw.trim() : '';
            if (!text) return;

            if (!isRevisionOf(segmentText.current, text)) {
                committedText.current = joinSegments(committedText.current, segmentText.current);
            }
            segmentText.current = text;

            onTranscriptRef.current(joinSegments(committedText.current, segmentText.current));
            resetSilenceTimer();
        }

        function finish() {
            clearSilenceTimer();
            volume.value = 0;
            setIsListening(false);
        }

        // Both events carry the cumulative best transcription for the session,
        // so each one can replace the prompt wholesale. Android streams interim
        // text via partial results and sends a final onSpeechResults; iOS sends
        // onSpeechResults continuously and its partials are non-string objects.
        function onSpeechPartialResults(e: SpeechResultsEvent) {
            applyTranscript(e);
        }

        function onSpeechResults(e: SpeechResultsEvent) {
            applyTranscript(e);
            // On Android the final onResults callback is what actually closes
            // the recognizer session. iOS keeps emitting results until it ends.
            if (Platform.OS === 'android') finish();
        }

        function onSpeechEnd(_e: SpeechEndEvent) {
            // Android fires onEndOfSpeech as soon as the user pauses, even though
            // the recognizer stays open for the configured silence window and
            // final results are still to come. Only iOS means "session over".
            if (Platform.OS === 'android') {
                volume.value = 0;
                return;
            }
            finish();
        }

        function onSpeechError(e: SpeechErrorEvent) {
            finish();
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
        Voice.onSpeechPartialResults = onSpeechPartialResults;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechError = onSpeechError;
        Voice.onSpeechVolumeChanged = onSpeechVolumeChanged;

        return () => {
            clearSilenceTimer();
            Voice.destroy().then(Voice.removeAllListeners);
        };
    }, [clearSilenceTimer, resetSilenceTimer, volume]);

    const startListening = useCallback(async () => {
        const hasPermission = await ensureMicPermission();
        if (!hasPermission) {
            Alert.alert(
                'Microphone access required',
                'Enable microphone access in your device settings to use speech-to-text.',
            );
            return;
        }

        committedText.current = '';
        segmentText.current = '';

        try {
            await Voice.start(
                'en-US',
                Platform.OS === 'android' ? ANDROID_START_OPTIONS : undefined,
            );
            setIsListening(true);
        } catch (err) {
            console.warn('[STT] failed to start', err);
            setIsListening(false);
        }
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
