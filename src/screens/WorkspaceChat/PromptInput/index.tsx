import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TouchableOpacity,
  Animated,
  BackHandler,
  Keyboard,
  View,
} from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { ArrowsInSimple, ArrowsOutSimple } from "phosphor-react-native";
import { screenDimensions } from "@/utils/constants";
import ActionMenu, { ACTION_MENU_HEIGHT } from "./Actions";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AttachmentInterface,
  ChatWindowAttachmentsContainer,
} from "@/hooks/useAttachments";
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from "@/contexts/BottomSheetContext";
import { useDrawerStatus } from "@react-navigation/drawer";
import useKeyboardHeight from "@/hooks/useKeyboardHeight";
import { PATHS } from "@/utils/paths";
import useRouteObserver from "@/hooks/useRouteObserver";
import { useChatHandlerContext } from "@/hooks/useChatHandler/index";
import useLlmPreference from "@/hooks/useLLMPreference";

const defaultPadding = [0, 0, 32]; // top padding for snap points
export const snapPointsDefault = ["22%", "60%", "100%"];

interface PromptInputProps {
  attachmentHandler: AttachmentInterface;
}

export default function PromptInput({ attachmentHandler }: PromptInputProps) {
  const chatHandler = useChatHandlerContext();
  const { llmPreferences } = useLlmPreference();
  const insets = useSafeAreaInsets();
  const { currentRoute } = useRouteObserver();
  const keyboardHeight = useKeyboardHeight();
  const drawerStatus = useDrawerStatus();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, activeSheet } = useBottomSheet();
  const paddingAnim = useRef(new Animated.Value(defaultPadding[0])).current;
  const snapPoints = useMemo(() => snapPointsDefault, []);
  const inputRef = useRef<View>(null);

  const [sheetIndex, setSheetIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const hasModelSelected = useMemo(() => {
    return !!llmPreferences?.config?.model;
  }, [llmPreferences]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      switch (index) {
        case -1:
          bottomSheetRef.current?.snapToIndex(0);
          setIsFullScreen(false);
          break;
        case 2:
          bottomSheetRef.current?.snapToIndex(snapPoints.length - 1);
          setIsFullScreen(true);
          break;
        default:
          setIsFullScreen(false);
          break;
      }

      setSheetIndex(index);
      Animated.timing(paddingAnim, {
        toValue: defaultPadding[index] ?? defaultPadding[0],
        duration: 150,
        delay: 0,
        useNativeDriver: false,
      }).start();
    },
    [presentSheet],
  );

  const HandleComponent = () => {
    function handleExpand() {
      const nextState = !isFullScreen;
      setIsFullScreen(nextState);
      // if we are going to the full screen, then we need to snap to the last index
      // Otherwise, change nothing about the behavior and lay the keyboard out
      if (nextState) bottomSheetRef.current?.snapToIndex(snapPoints.length - 1);
      else bottomSheetRef.current?.snapToIndex(0);

      // if we are going to the closed state, then we need to dismiss the keyboard
      if (!nextState) Keyboard.dismiss();
    }

    const icon = !isFullScreen ? (
      <ArrowsOutSimple size={20} color="white" />
    ) : (
      <ArrowsInSimple size={20} color="white" />
    );
    return (
      <Animated.View
        style={{
          top: paddingAnim,
          width: 40,
          position: "absolute",
          left: screenDimensions.width - 50,
        }}
        className="p-4">
        <TouchableOpacity onPress={handleExpand}>{icon}</TouchableOpacity>
      </Animated.View>
    );
  };

  const inputHeight = useMemo(() => {
    let currentSnapPoint = parseInt(snapPoints[sheetIndex]) / 100;
    if (isNaN(currentSnapPoint))
      currentSnapPoint = parseInt(snapPoints[0]) / 100;

    const actionMenuHeight = isFullScreen
      ? ACTION_MENU_HEIGHT * 2
      : ACTION_MENU_HEIGHT;
    return (
      screenDimensions.height * currentSnapPoint -
      insets.bottom -
      actionMenuHeight -
      keyboardHeight
    );
  }, [sheetIndex, keyboardHeight]);

  const handleTextInputChange = useCallback(
    (text: string) => {
      const cursorAt = selection.start;
      const oldLength = chatHandler.prompt.length;
      chatHandler.setPrompt(text);

      // For pasting keep cursor where the paste happened
      if (Math.abs(text.length - oldLength) > 1) {
        setSelection({
          start: cursorAt + (text.length - oldLength),
          end: cursorAt + (text.length - oldLength),
        });
        return;
      }

      // For normal typing/deletion move cursor one position
      const newCursorPosition = cursorAt + (text.length > oldLength ? 1 : -1);
      setSelection({
        start: Math.max(0, newCursorPosition),
        end: Math.max(0, newCursorPosition),
      });
    },
    [chatHandler, selection],
  );

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, bottomSheetRef);
  }, [registerSheet]);

  // Always present the prompt input on mount when:
  // - the drawer is closed
  // - the active sheet is null
  // - the bottom sheet ref exists
  // - the current route is the workspace chat route
  // then watch for changes to the active sheet
  useEffect(() => {
    if (
      drawerStatus === "closed" &&
      (activeSheet === null ||
        activeSheet === BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT) &&
      !!bottomSheetRef.current &&
      currentRoute === PATHS.workspace_chat
    )
      presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
  }, [activeSheet, currentRoute]);

  // Disable the back button when the input is focused
  // to prevent page navigation while in full screen
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () =>
      isInputFocused ? true : false,
    );
    return () => backHandler.remove();
  }, [isInputFocused]);

  // Handle the keyboard dismissing while in the half-open state
  useEffect(() => {
    // If the keyboard is in the half-open state, then we need to snap to the closed state
    // when the keyboard is dismissed by the user
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        if (sheetIndex === 1) bottomSheetRef.current?.snapToIndex(0);
      },
    );
    return () => keyboardDidHideListener.remove();
  }, [sheetIndex]);

  return (
    <>
      {sheetIndex === 0 && (
        <ChatWindowAttachmentsContainer attachmentHandler={attachmentHandler} />
      )}
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        keyboardBehavior="extend"
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        onChange={handleSheetChanges}
        handleComponent={HandleComponent}
        backgroundStyle={{
          backgroundColor: "#1B1B1E",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
        }}>
        <Animated.View
          key="primaryPromptInputContainer"
          ref={inputRef}
          style={{ paddingTop: paddingAnim }}
          className={"flex flex-col justify-between"}>
          <BottomSheetTextInput
            key="primaryPromptInput"
            keyboardType="default"
            multiline={true}
            placeholder={
              hasModelSelected
                ? "Enter your prompt"
                : "Please select a model first"
            }
            placeholderTextColor="#9F9FA0"
            className="text-white text-lg"
            editable={hasModelSelected}
            onFocus={() => {
              if (!hasModelSelected) {
                presentSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION);
                return;
              }
              if (sheetIndex === 0) bottomSheetRef.current?.snapToIndex(1);
              setIsInputFocused(true);
            }}
            onBlur={() => {
              setIsInputFocused(false);
              bottomSheetRef.current?.snapToIndex(0);
              Keyboard.dismiss();
            }}
            defaultValue={chatHandler.prompt}
            onChangeText={handleTextInputChange}
            onSelectionChange={event => setSelection(event.nativeEvent.selection)}
            selection={selection}
            scrollEnabled={true}
            style={{
              textAlignVertical: "top",
              height: inputHeight,
              borderRadius: 16,
              paddingTop: 16,
              paddingHorizontal: 20,
              opacity: hasModelSelected ? 1 : 0.5,
            }}
          />
          <ActionMenu
            isFullScreen={isFullScreen}
            sheetIndex={sheetIndex}
            attachmentHandler={attachmentHandler}
            chatHandler={chatHandler}
          />
        </Animated.View>
      </BottomSheetModal>
    </>
  );
}
