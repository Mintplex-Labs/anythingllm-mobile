import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { observer } from 'mobx-react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ArrowSquareOut, Microphone, PaperPlaneRight, Screencast, Stop } from 'phosphor-react-native';
import '../../global.css';
import '@/utils/polyfills';
import useTheme from '@/hooks/useTheme';
import { LLMPreferenceProvider } from '@/contexts/LLMPreferenceContext';
import useLlmPreference from '@/hooks/useLLMPreference';
import { BottomSheetProvider } from '@/contexts/BottomSheetContext';
import { ChatHandlerWrapper, useChatHandlerContext, useChatHistoryContext } from '@/hooks/useChatHandler';
import useVisionSupport from '@/hooks/useVisionSupport';
import useSpeechToText, { type SpeechToTextInterface } from '@/hooks/useSpeechToText';
import { IMAGE_QUALITY } from '@/hooks/useAttachments';
import UserAssistantPair from '@/screens/WorkspaceChat/ChatHistory/Messages';
import { ActivityExpansionProvider } from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/ActivityChain/ExpansionContext';
import CitationsActionSheet from '@/screens/WorkspaceChat/ChatHistory/CitationsActionSheet';
import DraftSheet from '@/screens/WorkspaceChat/ChatHistory/DraftSheet';
import ModelChip from '@/components/TopBar/ModelChip';
import VoiceRecordingIndicator from '@/components/VoiceRecordingIndicator';
import { useKeyboardDimensions } from '@/components/KeyboardAccessoryView/hooks/useKeyboardDimensions';
import { type WorkspaceType } from '@/database/models/Workspace';
import { type IAttachment } from '@/utils/AiProviders/baseOpenAILikeProvider';
import { prepareSharedImage } from '@/utils/SharedContent';
import { showToast } from '@/utils/Notification';
import uiStore from '@/store/UIStore';
import Telemetry from '@/utils/Telemetry';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { type QuickContextSession } from '@/quickContext';
import {
    SCREENSHOT_MAX_DIMENSION,
    closeAssistant,
    createAssistantSession,
    getAssistantPreferences,
    getInvocationScreenshot,
    openMainAppFromAssistant,
    setGlowState,
    type AssistantPreferences,
    type InvocationScreenshot,
} from './index';

/**
 * Root of the digital assistant overlay - a React root registered in index.js, rendered by
 * AssistantActivity over whatever app the user invoked the assistant from, over the native color wash.
 *
 * A floating card at the bottom of the screen with a pull-down handle: the conversation once it
 * starts, one row with the model chip, a "Share screen" chip that attaches the screenshot taken at
 * invocation (vision models only) - shown until the first prompt only - and the prompt pill
 * with the mic. Settings > Assistant can have the mic start listening and the
 * screenshot attached as soon as it opens. Built from the chat screen's pieces (chat handler, message
 * renderer, model chip, citations sheet) like the Quick Actions card. Dismissing mid-reply aborts the model.
 */

const CARD_BACKGROUND = '#1B1B1E';
const MUTED_TEXT = '#9F9FA0';
/** Fraction of the space above the keyboard the card may grow to before its history scrolls */
const CARD_MAX_HEIGHT_RATIO = 0.75;
/** Gap between the floating card and the screen edges / keyboard */
const CARD_MARGIN = 10;
/** Pull the card down this far (px), or flick it faster than this (px/s), to dismiss it */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;
/** Icon size inside the model chip - the screen chip matches it */
const CHIP_ICON_SIZE = 15;

type AssistantProps = {
    /** Invocation id from the native session; one overlay (and conversation) per invocation */
    invocation?: number;
};

const AssistantApp = observer((_props: AssistantProps) => {
    const theme = useTheme();
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PaperProvider theme={theme}>
                    <LLMPreferenceProvider>
                        <BottomSheetProvider>
                            <BottomSheetModalProvider>
                                <AssistantOverlay />
                            </BottomSheetModalProvider>
                        </BottomSheetProvider>
                    </LLMPreferenceProvider>
                </PaperProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
});

export default AssistantApp;

function AssistantOverlay() {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    // Translucent window: Android ignores adjustResize, so the card lifts itself above the keyboard.
    const { keyboardHeight } = useKeyboardDimensions(true);
    const { LLMProvider, llmPreferences, isLoading: isLoadingProvider } = useLlmPreference();
    const [session, setSession] = useState<QuickContextSession | null>(null);
    const [preferences, setPreferences] = useState<AssistantPreferences | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupNeeded, setSetupNeeded] = useState(false);
    // Whether the conversation has started - the pull handle only shows (and works) from then on.
    const [started, setStarted] = useState(false);
    const dismissRef = useRef<() => void>(closeAssistant);

    // One per invocation - each opens a fresh overlay (see AssistantSession).
    useEffect(() => { Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.ASSISTANT_INVOKED); }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const onboarded = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
            if (!onboarded) return setSetupNeeded(true);
            const prefs = await getAssistantPreferences();
            if (cancelled) return;
            setPreferences(prefs);
            setSession(createAssistantSession());
        })().catch((e) => {
            console.error('[Assistant] could not start session', e);
            if (!cancelled) setError((e as Error).message || i18n.t('assistant.could_not_start'));
        });
        return () => { cancelled = true; };
    }, []);

    // The on-device provider is shared with the main app: once the overlay is gone, a chat screen still
    // mounted behind it must attach its own workspace again.
    // Deferred a tick: React runs this (parent) cleanup before the overlay's own chat handler unsubscribes, so an
    // immediate emit would have that handler re-attach its workspace last and win.
    useEffect(() => () => { setTimeout(() => uiStore.emitter.emit(uiStore.globalEvents.WORKSPACE_REATTACH_REQUESTED), 0); }, []);

    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => { dismissRef.current(); return true; });
        return () => subscription.remove();
    }, []);

    const hasModel = !!llmPreferences?.config?.model && !!LLMProvider;
    const ready = !!session && !!preferences && !isLoadingProvider;
    const bottom = (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + CARD_MARGIN;

    // Pull-to-dismiss on the handle: the card follows the finger down (never up), then either slides
    // off and closes, or springs back.
    const dragY = useSharedValue(0);
    const dismissFromDrag = useCallback(() => dismissRef.current(), []);
    const pull = Gesture.Pan()
        .enabled(started)
        .activeOffsetY(8)
        .onUpdate((event) => { dragY.value = Math.max(0, event.translationY); })
        .onEnd((event) => {
            if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
                dragY.value = withTiming(height, { duration: 180 }, () => runOnJS(dismissFromDrag)());
            } else {
                dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
            }
        });
    const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

    return (
        // No backdrop here: the dim and the color wash are drawn natively under this root (AssistantActivity).
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} accessibilityLabel={t('assistant.dismiss')} onPress={() => dismissRef.current()} />
            <Animated.View
                style={[{
                    backgroundColor: CARD_BACKGROUND,
                    borderRadius: 28,
                    marginHorizontal: CARD_MARGIN,
                    marginBottom: bottom,
                    maxHeight: (height - bottom - insets.top) * CARD_MAX_HEIGHT_RATIO,
                    paddingBottom: 12,
                    overflow: 'hidden',
                }, cardStyle]}>
                <GestureDetector gesture={pull}>
                    {/* Always laid out so the card does not jump when it appears; invisible until the first prompt. */}
                    <View
                        accessible={started}
                        importantForAccessibility={started ? 'auto' : 'no-hide-descendants'}
                        accessibilityRole="adjustable"
                        accessibilityLabel={t('assistant.dismiss')}
                        style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6, opacity: started ? 1 : 0 }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#5A5A5E' }} />
                    </View>
                </GestureDetector>
                {ready && hasModel && session ? (
                    <ChatHandlerWrapper
                        workspace={session.workspace}
                        thread={session.thread}
                        llmProvider={LLMProvider!}
                        ephemeral>
                        <ActivityExpansionProvider>
                            <AssistantBody session={session} preferences={preferences!} dismissRef={dismissRef} onStartedChange={setStarted} />
                        </ActivityExpansionProvider>
                    </ChatHandlerWrapper>
                ) : (
                    <OverlayPlaceholder session={session} error={error} setupNeeded={setupNeeded} needsModel={ready && !hasModel} />
                )}
            </Animated.View>
            <CitationsActionSheet />
            <DraftSheet />
        </View>
    );
}

/** One compact row: the model chip (with its selection sheet) and any extra chips. */
function ControlsRow({ workspace, children }: { workspace: WorkspaceType | null; children?: React.ReactNode }) {
    return (
        <View className="flex flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 4, gap: 8 }}>
            {/* Shrinks first so a long model name never pushes the other chips off the card. The chip lifts itself 5px
                (marginTop: -5) to line up in the top bar - paddingTop cancels that here. */}
            <View style={{ flexShrink: 1, paddingTop: 5 }}>
                {workspace && <ModelChip workspace={workspace} />}
            </View>
            {children}
        </View>
    );
}

/** Shown while the session starts, when setup is incomplete, when no model is selected, or on failure. */
function OverlayPlaceholder({ session, error, setupNeeded, needsModel }: {
    session: QuickContextSession | null;
    error: string | null;
    setupNeeded: boolean;
    needsModel: boolean;
}) {
    const { t } = useTranslation();
    let content: React.ReactNode;
    if (setupNeeded) {
        content = (
            <>
                <Text className="text-white text-base text-center">{t('assistant.setup_needed')}</Text>
                <TouchableOpacity onPress={openMainAppFromAssistant} activeOpacity={0.7} className="flex flex-row items-center rounded-full bg-white" style={{ gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <ArrowSquareOut size={16} color="#000" />
                    <Text className="text-sm font-medium text-black">{t('assistant.open_anythingllm')}</Text>
                </TouchableOpacity>
            </>
        );
    } else if (error) {
        content = <Text className="text-red-500 text-base text-center">{error}</Text>;
    } else if (needsModel) {
        content = <Text className="text-base text-center" style={{ color: MUTED_TEXT }}>{t('assistant.select_model')}</Text>;
    } else {
        content = <ActivityIndicator size="large" color="#FFF" />;
    }

    return (
        <>
            <ControlsRow workspace={session?.workspace ?? null} />
            <View className="flex items-center" style={{ gap: 14, paddingVertical: 20, paddingHorizontal: 20 }}>{content}</View>
        </>
    );
}

/** The working overlay: conversation, screen chip and prompt pill. */
function AssistantBody({ session, preferences, dismissRef, onStartedChange }: {
    session: QuickContextSession;
    preferences: AssistantPreferences;
    dismissRef: React.MutableRefObject<() => void>;
    /** Tells the overlay when the first prompt went out (and so the pull handle should show). */
    onStartedChange: (started: boolean) => void;
}) {
    const { t } = useTranslation();
    const chatHandler = useChatHandlerContext();
    const { chats, isWorking } = useChatHistoryContext();
    const { llmPreferences } = useLlmPreference();
    const vision = useVisionSupport({ isRemote: false });
    const [draft, setDraft] = useState('');
    // null while the system is still delivering it
    const [screen, setScreen] = useState<InvocationScreenshot | null>(null);
    const [attachScreen, setAttachScreen] = useState(preferences.autoScreenshot);
    const [sending, setSending] = useState(false);
    const usedVoice = useRef(false);
    // Set on send: stopping the recognizer can still deliver a final transcript, which must not refill the pill.
    const ignoreTranscript = useRef(false);
    const scrollRef = useRef<ScrollView>(null);
    const speechToText = useSpeechToText(useCallback((text: string) => {
        if (ignoreTranscript.current) return;
        usedVoice.current = true;
        setDraft(text);
    }, []));
    const listen = useCallback(() => {
        ignoreTranscript.current = false;
        return speechToText.startListening();
    }, [speechToText]);

    const started = chats.length > 0;
    useEffect(() => { onStartedChange(started); }, [started, onStartedChange]);
    const disabled = chatHandler.promptDisabled || sending;

    useEffect(() => {
        let cancelled = false;
        getInvocationScreenshot()
            .then((result) => { if (!cancelled) setScreen(result); })
            .catch(() => { if (!cancelled) setScreen({ uri: null, reason: 'timeout' }); });
        return () => { cancelled = true; };
    }, []);

    // "Start listening" in Settings: dictation begins with the overlay, the words fill the pill as they come.
    const startListening = useRef(listen);
    startListening.current = listen;
    useEffect(() => {
        if (preferences.autoListen) startListening.current().catch(() => null);
    }, [preferences.autoListen]);

    useEffect(() => {
        setGlowState(speechToText.isListening ? 'listening' : isWorking ? 'thinking' : 'idle');
    }, [speechToText.isListening, isWorking]);

    const dismiss = useCallback(() => {
        if (isWorking) chatHandler.abortChat();
        if (speechToText.isListening) speechToText.stopListening().catch(() => null);
        closeAssistant();
    }, [isWorking, chatHandler, speechToText]);

    useEffect(() => { dismissRef.current = dismiss; }, [dismiss, dismissRef]);

    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, [chats]);

    const screenReady = !!screen?.uri && vision.supportsVision;
    const willAttach = attachScreen && screenReady;

    const send = useCallback(async () => {
        const text = draft.trim();
        if (!text || disabled) return;
        ignoreTranscript.current = true;
        if (speechToText.isListening) await speechToText.stopListening().catch(() => null);
        setSending(true);
        try {
            const attachments: IAttachment[] = [];
            if (willAttach && screen?.uri) {
                try {
                    attachments.push(await screenshotAttachment(screen.uri, llmPreferences?.provider));
                } catch (e) {
                    console.error('[Assistant] could not prepare the screenshot', e);
                    showToast(t('assistant.screen_unavailable'));
                }
            }
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.ASSISTANT_CHAT_SENT, {
                screenshot: attachments.length > 0,
                voice: usedVoice.current,
                followUp: started,
            });
            setDraft('');
            usedVoice.current = false;
            // The screen goes with one prompt; the user can attach it again for a follow-up.
            setAttachScreen(false);
            chatHandler.submitPrompt(text, attachments);
        } finally {
            setSending(false);
        }
    }, [draft, disabled, speechToText, willAttach, screen, llmPreferences?.provider, started, chatHandler, t]);

    const onScreenChipPress = useCallback(() => {
        if (!screen) return;
        if (screen.uri === null) return showToast(screenUnavailableMessage(screen.reason));
        if (!vision.supportsVision) return showToast(t('assistant.needs_vision', { reason: vision.reason ?? '' }).trim());
        setAttachScreen((value) => !value);
    }, [screen, vision.supportsVision, vision.reason, t]);

    return (
        <>
            {started && (
                <ScrollView
                    ref={scrollRef}
                    style={{ flexGrow: 0, flexShrink: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8, gap: 20 }}
                    showsVerticalScrollIndicator={false}>
                    {chats.map((chat) => <UserAssistantPair key={chat.uuid} chat={chat} />)}
                </ScrollView>
            )}

            {/* Before the first prompt only - once the conversation starts, the pill is all that is left. */}
            {!started && (
                <ControlsRow workspace={session.workspace}>
                    <ScreenChip
                        screen={screen}
                        attached={willAttach}
                        available={screenReady}
                        disabled={disabled}
                        onPress={onScreenChipPress}
                    />
                </ControlsRow>
            )}

            <PromptPill
                value={draft}
                onChange={setDraft}
                disabled={disabled}
                working={isWorking}
                onSend={send}
                onStop={chatHandler.abortChat}
                onListen={listen}
                speechToText={speechToText}
                placeholder={started ? t('assistant.placeholder_followup') : t('assistant.placeholder')}
            />
        </>
    );
}

/** Scale the invocation screenshot for the selected provider and encode it like any image attachment. */
async function screenshotAttachment(uri: string, provider?: string): Promise<IAttachment> {
    const maxDimension = provider === 'native' ? SCREENSHOT_MAX_DIMENSION.onDevice : SCREENSHOT_MAX_DIMENSION.external;
    const { base64, mime } = await prepareSharedImage(uri, { maxDimension, quality: IMAGE_QUALITY });
    return { name: 'screenshot.jpg', mime, contentString: `data:${mime};base64,${base64}` };
}

function screenUnavailableMessage(reason: string): string {
    if (reason === 'disabled') return i18n.t('assistant.screen_disabled');
    if (reason === 'blocked') return i18n.t('assistant.screen_blocked');
    return i18n.t('assistant.screen_unavailable');
}

/**
 * "Share screen": an icon toggle that attaches the screenshot of the app underneath to the next prompt,
 * filled while on. Dimmed (and explains why on tap) when there is no screenshot or the model cannot see.
 */
function ScreenChip({ screen, attached, available, disabled, onPress }: {
    screen: InvocationScreenshot | null;
    attached: boolean;
    available: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    const { t } = useTranslation();
    const loading = screen === null;
    const color = attached ? '#000' : '#FFF';
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.7}
            accessibilityRole="togglebutton"
            accessibilityState={{ checked: attached, disabled: !available }}
            accessibilityLabel={t('assistant.share_screen')}
            className={`flex flex-row items-center rounded-full ${attached ? 'bg-white' : 'bg-white/10'}`}
            // Same padding as the model chip next to it; the same box in both states so toggling never shifts the row
            style={{ paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0, opacity: available || loading ? 1 : 0.5 }}>
            <View style={{ width: CHIP_ICON_SIZE, height: CHIP_ICON_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                {loading
                    ? <ActivityIndicator size={CHIP_ICON_SIZE} color="#FFF" />
                    : <Screencast size={CHIP_ICON_SIZE} color={color} weight={attached ? 'fill' : 'regular'} />}
            </View>
            {/* Zero-width 14px line so the chip is exactly as tall as the model chip's text line */}
            <Text style={{ fontSize: 14, width: 0 }}> </Text>
        </TouchableOpacity>
    );
}

/** The prompt pill: mic while empty, send once there is text, stop while a reply streams. */
function PromptPill({ value, onChange, disabled, working, onSend, onStop, onListen, speechToText, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    working: boolean;
    onSend: () => void;
    onStop: () => void;
    onListen: () => void;
    speechToText: SpeechToTextInterface;
    placeholder: string;
}) {
    const { t } = useTranslation();
    const hasDraft = !!value.trim();
    const canSend = !disabled && !working && hasDraft;

    let control: React.ReactNode;
    if (working) {
        control = (
            <TouchableOpacity onPress={onStop} accessibilityLabel={t('chat.prompt_input.stop_generating')}>
                <Stop size={24} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    } else if (speechToText.isListening && !hasDraft) {
        control = (
            <TouchableOpacity onPress={speechToText.stopListening} accessibilityLabel={t('chat.prompt_input.stop_recording')}>
                <VoiceRecordingIndicator volume={speechToText.volume} />
            </TouchableOpacity>
        );
    } else if (!hasDraft) {
        control = (
            <TouchableOpacity onPress={onListen} disabled={disabled} accessibilityLabel={t('chat.prompt_input.voice_input')} style={{ opacity: disabled ? 0.4 : 1 }}>
                <Microphone size={24} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    } else {
        // Send stays reachable while dictating so the user can fire off what they said without waiting.
        control = (
            <TouchableOpacity onPress={onSend} disabled={!canSend} accessibilityLabel={t('chat.prompt_input.send_prompt')} style={{ opacity: canSend ? 1 : 0.4 }}>
                <PaperPlaneRight size={24} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    }

    return (
        <View className="flex flex-row items-end bg-white/10" style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 24, paddingLeft: 16, paddingRight: 12, gap: 10 }}>
            <TextInput
                value={value}
                onChangeText={onChange}
                editable={!disabled}
                multiline
                placeholder={speechToText.isListening ? t('assistant.listening') : placeholder}
                placeholderTextColor={MUTED_TEXT}
                className="flex-1 text-white text-base"
                // Italic while dictating so the user can tell the text is still being transcribed, like the main input.
                style={{ paddingVertical: 12, minHeight: 48, maxHeight: 120, opacity: disabled ? 0.5 : 1, fontStyle: speechToText.isListening ? 'italic' : 'normal' }}
            />
            <View style={{ paddingBottom: 12, minWidth: 25, alignItems: 'center' }}>{control}</View>
        </View>
    );
}
