import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    Image,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { observer } from 'mobx-react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ArrowSquareOut, Copy, Microphone, PaperPlaneRight, Quotes, Stop, X } from 'phosphor-react-native';
import '../../global.css';
import '@/utils/polyfills';
import useTheme from '@/hooks/useTheme';
import { LLMPreferenceProvider } from '@/contexts/LLMPreferenceContext';
import useLlmPreference from '@/hooks/useLLMPreference';
import { BottomSheetProvider } from '@/contexts/BottomSheetContext';
import { ChatHandlerWrapper, useChatHandlerContext, useChatHistoryContext } from '@/hooks/useChatHandler';
import UserAssistantPair from '@/screens/WorkspaceChat/ChatHistory/Messages';
import AssistantMessage from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant';
import { ActivityExpansionProvider } from '@/screens/WorkspaceChat/ChatHistory/Messages/Assistant/ActivityChain/ExpansionContext';
import CitationsActionSheet from '@/screens/WorkspaceChat/ChatHistory/CitationsActionSheet';
import ModelChip from '@/components/TopBar/ModelChip';
import VoiceRecordingIndicator from '@/components/VoiceRecordingIndicator';
import { useKeyboardDimensions } from '@/components/KeyboardAccessoryView/hooks/useKeyboardDimensions';
import useSpeechToText, { type SpeechToTextInterface } from '@/hooks/useSpeechToText';
import { type WorkspaceType } from '@/database/models/Workspace';
import { hapticOptions } from '@/utils/clipboard';
import { showToast } from '@/utils/Notification';
import uiStore from '@/store/UIStore';
import Telemetry from '@/utils/Telemetry';
import { QUICK_MODES, buildQuickContextPrompt, guessQuickMode, quickActionsFor, type QuickAction, type QuickMode } from './actions';
import {
    closeQuickContext,
    createEphemeralSession,
    createPersistentSession,
    discardEmptyQuickContextThread,
    isPersistentMode,
    nameQuickContextThread,
    openMainApp,
    openQuickContextInApp,
    type QuickContextSession,
} from './index';

/**
 * Root of the Quick Actions card - the second React root registered in index.js, rendered by
 * QuickContextActivity over whatever app the text was selected in.
 *
 * Nothing tells us whether the selection is in a field the user is typing in or on a page they are
 * reading, so the card has two modes behind one toggle: Edit (polish, shorten, fix, formalize - the
 * result is pasted over the selection) and Summarize (summarize, key points, explain, research). A
 * free-form instruction covers anything else. Copy puts the result on the clipboard and closes the
 * card so the user lands back on their still-selected text. (The card never sends a PROCESS_TEXT
 * result back: hosts apply it inconsistently - Chromium appends it, custom editors ignore it - and a
 * returned result is what would disturb the selection.) It is built from the main app's own pieces
 * (ModelChip and its model sheet, the chat handler, the assistant message renderer, the citations
 * sheet) so it looks and behaves like the chat screen, anchored to the bottom of the screen and
 * without the drawer. Edit sessions are ephemeral and never show up in the app; Summarize sessions
 * are real threads in the Quick Actions workspace that can be continued in the main app. Dismissing
 * the card mid-reply aborts the model so no tokens are wasted.
 */

/** Same surface as the prompt input sheet in the chat screen */
const CARD_BACKGROUND = '#1B1B1E';
const MUTED_TEXT = '#9F9FA0';
const SELECTION_TEXT = '#E2E2E2';
/** Fraction of the screen the card may grow to before its history scrolls */
const CARD_MAX_HEIGHT_RATIO = 0.88;
/** Space under the input row, on top of the system inset, so it does not sit flush on the nav bar */
const CARD_BOTTOM_PADDING = 20;
/** Custom prompts name a saved thread after their first words */
const CUSTOM_PROMPT_LABEL_CHARS = 24;

type QuickContextProps = {
    /** The highlighted text, from the PROCESS_TEXT intent */
    selectedText?: string;
};

const QuickContextApp = observer(({ selectedText = '' }: QuickContextProps) => {
    const theme = useTheme();
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PaperProvider theme={theme}>
                    <LLMPreferenceProvider>
                        <BottomSheetProvider>
                            <BottomSheetModalProvider>
                                <QuickContextCard selectedText={selectedText} />
                            </BottomSheetModalProvider>
                        </BottomSheetProvider>
                    </LLMPreferenceProvider>
                </PaperProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
});

export default QuickContextApp;

function QuickContextCard({ selectedText }: Required<QuickContextProps>) {
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    // The window is translucent, which makes Android ignore adjustResize (the manifest asks for
    // adjustNothing), so the card lifts itself: its bottom padding grows to the keyboard's height.
    const { keyboardHeight } = useKeyboardDimensions(true);
    const { LLMProvider, llmPreferences, isLoading: isLoadingProvider } = useLlmPreference();
    // Opens in the mode the selection looks like it wants (see guessQuickMode); the toggle overrides it.
    // The mode lives here because switching it swaps the session (and so the chat handler) under the body.
    const [mode, setMode] = useState<QuickMode>(() => guessQuickMode(selectedText));
    const [ephemeralSession, setEphemeralSession] = useState<QuickContextSession | null>(null);
    // Created the first time the user switches to Summarize; one thread for the whole invocation.
    const [persistentSession, setPersistentSession] = useState<QuickContextSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupNeeded, setSetupNeeded] = useState(false);
    // How to leave the card right now: the body swaps in a version that aborts a running reply first.
    const dismissRef = useRef<() => void>(closeQuickContext);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const onboarded = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
            if (!onboarded) return setSetupNeeded(true);
            if (!cancelled) setEphemeralSession(createEphemeralSession());
        })().catch((e) => {
            console.error('[QuickContext] could not start session', e);
            if (!cancelled) setError((e as Error).message || 'Could not start Quick Actions');
        });
        return () => { cancelled = true; };
    }, []);

    // Summarize needs a real thread - make it on first switch, keep it if the user toggles back and forth.
    const wantsPersistent = isPersistentMode(mode);
    useEffect(() => {
        if (!wantsPersistent || persistentSession || !ephemeralSession) return;
        let cancelled = false;
        createPersistentSession()
            .then((created) => { if (!cancelled) setPersistentSession(created); })
            .catch((e) => {
                console.error('[QuickContext] could not start persistent session', e);
                if (!cancelled) setError((e as Error).message || 'Could not start Quick Actions');
            });
        return () => { cancelled = true; };
    }, [wantsPersistent, persistentSession, ephemeralSession]);

    // The on-device provider is a singleton shared with the main app: once the card is gone, any chat
    // screen still mounted behind it must attach its own workspace again.
    useEffect(() => () => { uiStore.emitter.emit(uiStore.globalEvents.WORKSPACE_REATTACH_REQUESTED); }, []);

    /**
     * Leave the card. A Summarize thread nothing was saved to is dropped again, as is one the user
     * created by peeking at Summarize before going back to Edit.
     */
    const close = useCallback(async (savedInSession: number) => {
        if (persistentSession && (!wantsPersistent || savedInSession === 0)) {
            await discardEmptyQuickContextThread(persistentSession).catch(() => null);
        }
        closeQuickContext();
    }, [persistentSession, wantsPersistent]);

    const session = wantsPersistent ? persistentSession : ephemeralSession;
    // Keep the body up (and the toggle with it) while the Summarize thread is being created.
    const shownSession = session ?? ephemeralSession;
    const hasModel = !!llmPreferences?.config?.model && !!LLMProvider;
    const ready = !!shownSession && !isLoadingProvider;

    return (
        // The dim sits on the whole overlay (not just the area above the card) so the host app does not
        // show undimmed through the card's rounded top corners.
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
            {/* Tapping the dimmed app behind the card dismisses it, like the sheets in the chat screen */}
            <Pressable style={{ flex: 1 }} accessibilityLabel="Dismiss" onPress={() => dismissRef.current()} />
            <View
                style={{
                    backgroundColor: CARD_BACKGROUND,
                    borderTopLeftRadius: 30,
                    borderTopRightRadius: 30,
                    maxHeight: (height - keyboardHeight) * CARD_MAX_HEIGHT_RATIO,
                    // The keyboard already clears the system bar, so the inset only applies while it is closed.
                    paddingBottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + CARD_BOTTOM_PADDING,
                }}>
                {ready && hasModel && shownSession ? (
                    // Keyed on the thread so switching mode before the first prompt starts a fresh handler.
                    <ChatHandlerWrapper
                        key={shownSession.thread.slug}
                        workspace={shownSession.workspace}
                        thread={shownSession.thread}
                        llmProvider={LLMProvider!}
                        ephemeral={shownSession.ephemeral}>
                        <ActivityExpansionProvider>
                            <CardBody
                                session={shownSession}
                                mode={mode}
                                onModeChange={setMode}
                                switching={session === null}
                                selectedText={selectedText}
                                dismissRef={dismissRef}
                                onClose={close}
                            />
                        </ActivityExpansionProvider>
                    </ChatHandlerWrapper>
                ) : (
                    <CardPlaceholder
                        session={shownSession}
                        error={error}
                        setupNeeded={setupNeeded}
                        needsModel={ready && !hasModel}
                        selectedText={selectedText}
                    />
                )}
            </View>
            <CitationsActionSheet />
        </View>
    );
}

/** Logo, the model chip (with its selection sheet) and close - the card's take on the TopBar. */
function CardHeader({ workspace, onClose }: { workspace: WorkspaceType | null; onClose: () => void }) {
    return (
        <View className="flex flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
            <Image source={require('@/assets/logo/anything-llm.png')} style={{ width: 110, height: 36 }} resizeMode="contain" />
            <View style={{ flex: 1, alignItems: 'center', paddingTop: 5 }}>
                {workspace && <ModelChip workspace={workspace} />}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <X size={22} color="#FFF" />
            </TouchableOpacity>
        </View>
    );
}

/** Shown while the session starts, when setup is incomplete, when no model is selected, or on failure. */
function CardPlaceholder({ session, error, setupNeeded, needsModel, selectedText }: {
    session: QuickContextSession | null;
    error: string | null;
    setupNeeded: boolean;
    needsModel: boolean;
    selectedText: string;
}) {
    let content: React.ReactNode;
    if (setupNeeded) {
        content = (
            <>
                <Text className="text-white text-base text-center">Finish setting up AnythingLLM to use it from the selection menu.</Text>
                <Pill label="Open AnythingLLM" icon={<ArrowSquareOut size={16} color="#000" />} primary onPress={openMainApp} />
            </>
        );
    } else if (error) {
        content = <Text className="text-red-500 text-base text-center">{error}</Text>;
    } else if (needsModel) {
        content = <Text className="text-base text-center" style={{ color: MUTED_TEXT }}>Select a model above to get started.</Text>;
    } else {
        content = <ActivityIndicator size="large" color="#FFF" />;
    }

    return (
        <>
            <CardHeader workspace={session?.workspace ?? null} onClose={closeQuickContext} />
            <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 8 }}>
                {!!selectedText && <SelectionPreview text={selectedText} expanded={false} onToggle={() => {}} />}
                <View className="flex items-center" style={{ gap: 14, paddingVertical: 12 }}>{content}</View>
            </View>
        </>
    );
}

/** The working card: mode and quick actions, selection, the conversation, follow-up input and result actions. */
function CardBody({ session, mode, onModeChange, switching, selectedText, dismissRef, onClose }: {
    session: QuickContextSession;
    mode: QuickMode;
    onModeChange: (mode: QuickMode) => void;
    /** The session for the chosen mode is still being created - hold the actions until it is. */
    switching: boolean;
    selectedText: string;
    dismissRef: React.MutableRefObject<() => void>;
    /** Leave the card; told how many exchanges this session saved so an empty thread can be dropped. */
    onClose: (savedInSession: number) => void;
}) {
    const chatHandler = useChatHandlerContext();
    const { chats, isWorking } = useChatHistoryContext();
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<ScrollView>(null);
    const actions = useMemo(() => quickActionsFor(mode), [mode]);
    // Same dictation as the main prompt input: the transcript lands in the draft, the user sends it.
    const speechToText = useSpeechToText(useCallback((text: string) => setDraft(text), []));

    const started = chats.length > 0;
    const savedCount = chats.filter((chat) => !chat.isLoading).length;
    const lastChat = chats[chats.length - 1];
    const lastReply = lastChat && !lastChat.isLoading && lastChat.type !== 'error' ? (lastChat.response?.textResponse || '').trim() : '';
    const actionsDisabled = chatHandler.promptDisabled || switching;

    // Leaving mid-reply stops the model first - an aborted turn is never saved, so every further token
    // would be wasted. (The chat handler aborts on unmount as well, as a backstop.)
    const dismiss = useCallback(() => {
        if (isWorking) chatHandler.abortChat();
        onClose(savedCount);
    }, [isWorking, chatHandler, onClose, savedCount]);

    useEffect(() => {
        dismissRef.current = dismiss;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => { dismiss(); return true; });
        return () => subscription.remove();
    }, [dismiss, dismissRef]);

    // Follow the stream like the chat screen does.
    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, [chats]);

    const send = useCallback(async (instruction: string, action: QuickAction | null) => {
        const text = instruction.trim();
        if (!text) return;
        const isFirst = chats.length === 0;
        setDraft('');
        if (isFirst) {
            // Saved threads are named after the action, so the sidebar reads "Summarize · <selection>".
            const label = action?.label ?? (text.length > CUSTOM_PROMPT_LABEL_CHARS ? `${text.slice(0, CUSTOM_PROMPT_LABEL_CHARS).trimEnd()}…` : text);
            await nameQuickContextThread(session, label, selectedText).catch(() => null);
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.QUICK_CONTEXT_USED, { mode, action: action?.label ?? 'custom' });
        }
        // The selection rides along with the first prompt only - later turns are plain follow-ups.
        chatHandler.submitPrompt(isFirst ? buildQuickContextPrompt(text, selectedText) : text);
    }, [chats.length, session, selectedText, chatHandler, mode]);

    /**
     * Copy the result and close straight away. The card finishes without a PROCESS_TEXT result, so
     * hosts that kept their selection while we were open (framework text fields) still show it
     * highlighted - in Edit mode, Paste replaces it in one tap.
     */
    const copyAndClose = useCallback(() => {
        if (!lastReply) return;
        Clipboard.setString(lastReply);
        ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
        showToast(mode === 'edit' ? 'Copied - paste it over your selection' : 'Copied');
        closeQuickContext();
    }, [lastReply, mode]);

    return (
        <>
            <CardHeader workspace={session.workspace} onClose={dismiss} />
            <View style={{ paddingHorizontal: 20, gap: 12, paddingTop: 8 }}>
                {!started && (
                    <View className="flex flex-row items-center" style={{ gap: 10 }}>
                        <ModeToggle mode={mode} onChange={onModeChange} />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flex: 1 }}>
                            {actions.map((action) => (
                                <Pill key={action.label} label={action.label} disabled={actionsDisabled} onPress={() => send(action.prompt(), action)} />
                            ))}
                        </ScrollView>
                    </View>
                )}
                <SelectionPreview text={selectedText} expanded={expanded} onToggle={() => setExpanded((value) => !value)} lines={started ? 2 : 3} />
            </View>

            {started && (
                <ScrollView
                    ref={scrollRef}
                    style={{ flexGrow: 0, flexShrink: 1, marginTop: 12 }}
                    contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8, gap: 20 }}
                    showsVerticalScrollIndicator={false}>
                    {chats.map((chat, index) => (
                        // The first turn is the chip the user tapped applied to the selection shown above -
                        // repeating both as a prompt bubble adds nothing, so only the result is shown.
                        // Follow-ups read as a conversation and keep the full pair.
                        index === 0
                            ? <AssistantMessage key={chat.uuid} chat={chat} />
                            : <UserAssistantPair key={chat.uuid} chat={chat} />
                    ))}
                </ScrollView>
            )}

            {!!lastReply && !isWorking && (
                <View className="flex flex-row items-center" style={{ gap: 8, paddingHorizontal: 20, marginTop: 8 }}>
                    <Pill label="Copy & close" icon={<Copy size={16} color="#000" />} primary onPress={copyAndClose} />
                    <View style={{ flex: 1 }} />
                    {!session.ephemeral && (
                        <TouchableOpacity onPress={() => openQuickContextInApp(session)} hitSlop={8} accessibilityLabel="Open in app" className="flex flex-row items-center" style={{ gap: 4 }}>
                            <ArrowSquareOut size={16} color={MUTED_TEXT} />
                            <Text className="text-sm" style={{ color: MUTED_TEXT }}>Open in app</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <InputRow
                value={draft}
                onChange={setDraft}
                disabled={actionsDisabled}
                working={isWorking}
                placeholder={inputPlaceholder(mode, started)}
                onSend={() => send(draft, null)}
                onStop={chatHandler.abortChat}
                speechToText={speechToText}
            />
        </>
    );
}

/** What the input invites, by mode and whether the conversation has started. */
function inputPlaceholder(mode: QuickMode, started: boolean): string {
    if (mode === 'edit') return started ? 'Adjust text further…' : 'How should this text change?';
    return started ? 'Ask more questions…' : 'Ask anything about this text…';
}

function SelectionPreview({ text, expanded, onToggle, lines = 3 }: { text: string; expanded: boolean; onToggle: () => void; lines?: number }) {
    if (!text) return null;
    return (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.8} className="rounded-2xl bg-white/5" style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
            <View className="flex flex-row items-start" style={{ gap: 8 }}>
                <Quotes size={16} color={MUTED_TEXT} weight="fill" style={{ marginTop: 2 }} />
                <Text style={{ color: SELECTION_TEXT, flex: 1, fontSize: 14, lineHeight: 20 }} numberOfLines={expanded ? undefined : lines}>
                    {text.trim()}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

/**
 * The instruction input: a compact version of the chat screen's prompt input with the same controls -
 * mic while the draft is empty, send once there is text, stop while a reply streams.
 */
function InputRow({ value, onChange, disabled, working, placeholder, onSend, onStop, speechToText }: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    working: boolean;
    placeholder: string;
    onSend: () => void;
    onStop: () => void;
    speechToText: SpeechToTextInterface;
}) {
    const hasDraft = !!value.trim();
    const canSend = !disabled && !working && hasDraft;

    let control: React.ReactNode;
    if (working) {
        control = (
            <TouchableOpacity onPress={onStop} accessibilityLabel="Stop generating">
                <Stop size={25} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    } else if (speechToText.isListening) {
        control = (
            <TouchableOpacity onPress={speechToText.stopListening} accessibilityLabel="Stop recording">
                <VoiceRecordingIndicator volume={speechToText.volume} />
            </TouchableOpacity>
        );
    } else if (!hasDraft) {
        control = (
            <TouchableOpacity onPress={speechToText.startListening} disabled={disabled} accessibilityLabel="Voice input" style={{ opacity: disabled ? 0.4 : 1 }}>
                <Microphone size={25} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    } else {
        control = (
            <TouchableOpacity onPress={onSend} disabled={!canSend} accessibilityLabel="Send prompt" style={{ opacity: canSend ? 1 : 0.4 }}>
                <PaperPlaneRight size={25} color="#FFF" weight="fill" />
            </TouchableOpacity>
        );
    }

    return (
        <View className="flex flex-row items-end" style={{ gap: 10, paddingHorizontal: 20, marginTop: 12 }}>
            <TextInput
                value={value}
                onChangeText={onChange}
                editable={!disabled}
                multiline
                placeholder={placeholder}
                placeholderTextColor={MUTED_TEXT}
                className="flex-1 text-white text-base bg-white/10 rounded-2xl"
                // Italic while dictating so the user can tell the text is still being transcribed, like the main input.
                style={{ paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, maxHeight: 120, opacity: disabled ? 0.5 : 1, fontStyle: speechToText.isListening ? 'italic' : 'normal' }}
            />
            <View style={{ paddingBottom: 10, minWidth: 25, alignItems: 'center' }}>{control}</View>
        </View>
    );
}

/** Edit | Summarize - one joined pill with two segments, the selected one filled like the model chip. */
function ModeToggle({ mode, onChange }: { mode: QuickMode; onChange: (mode: QuickMode) => void }) {
    return (
        <View className="flex flex-row rounded-full bg-white/10" style={{ padding: 3 }} accessibilityRole="tablist">
            {QUICK_MODES.map(({ key, label }) => {
                const selected = key === mode;
                return (
                    <TouchableOpacity
                        key={key}
                        onPress={() => onChange(key)}
                        activeOpacity={0.7}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        className={`rounded-full ${selected ? 'bg-white' : ''}`}
                        style={{ paddingHorizontal: 12, paddingVertical: 5 }}>
                        <Text className={`text-sm font-medium ${selected ? 'text-black' : 'text-white'}`}>{label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

/** Rounded chip used for quick actions and result actions - the same shape as the model chip. */
function Pill({ label, icon, onPress, disabled = false, primary = false }: {
    label: string;
    icon?: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    primary?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.7}
            className={`flex flex-row items-center rounded-full ${primary ? 'bg-white' : 'bg-white/10'}`}
            style={{ gap: 6, paddingHorizontal: 14, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
            {icon}
            <Text className={`text-sm font-medium ${primary ? 'text-black' : 'text-white'}`}>{label}</Text>
        </TouchableOpacity>
    );
}
