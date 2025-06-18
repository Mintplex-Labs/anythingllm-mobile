import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TouchableOpacity, Animated, BackHandler, Keyboard, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ArrowsInSimple, ArrowsOutSimple } from "phosphor-react-native";
import { screenDimensions } from '@/utils/constants';
import ActionMenu, { ACTION_MENU_HEIGHT } from './Actions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachmentInterface } from '@/hooks/useAttachments';

const defaultPadding = [0, 0, 32]; // top padding for snap points
const bottomSheetPadding = [0, 380, 80]; // bottom padding for snap points
const snapPointsDefault = ['22%', '60%', '100%'];

interface PromptInputProps {
    attachmentHandler: AttachmentInterface;
}

export default function PromptInput({ attachmentHandler }: PromptInputProps) {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const paddingAnim = useRef(new Animated.Value(defaultPadding[0])).current;
    const snapPoints = useMemo(() => snapPointsDefault, []);
    const inputRef = useRef<View>(null);

    const [sheetIndex, setSheetIndex] = useState(0);
    const [prompt, setPrompt] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const handleSheetChanges = useCallback((index: number) => {
        switch (index) {
            case -1:
                bottomSheetRef.current?.snapToIndex(0);
                bottomSheetRef.current?.present();
                setIsFullScreen(false);
                break;
            case 2:
                bottomSheetRef.current?.snapToIndex(snapPoints.length - 1);
                setIsFullScreen(true);
                break;
            default:
                setIsFullScreen(false)
                break;
        }

        setSheetIndex(index);
        Animated.timing(paddingAnim, {
            toValue: defaultPadding[index] ?? defaultPadding[0],
            duration: 150,
            delay: 0,
            useNativeDriver: false,
        }).start();
    }, []);

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

        const icon = !isFullScreen ? <ArrowsOutSimple size={20} color="white" /> : <ArrowsInSimple size={20} color="white" />;
        return (
            <Animated.View style={{ top: paddingAnim, width: 40, position: 'absolute', left: screenDimensions.width - 50 }} className="p-4">
                <TouchableOpacity onPress={handleExpand} >
                    {icon}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const inputHeight = useMemo(() => {
        const currentSnapPoint = parseInt(snapPoints[sheetIndex]) / 100;
        return (screenDimensions.height) * currentSnapPoint - ACTION_MENU_HEIGHT - insets.bottom;
    }, [sheetIndex, insets.bottom]);

    // Disable the back button when the input is focused
    // to prevent page navigation while in full screen
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (isInputFocused) return true;
            return false;
        });

        return () => {
            backHandler.remove();
        };
    }, [isInputFocused]);

    // Handle the keyboard dismissing while in the half-open state
    useEffect(() => {
        // If the keyboard is in the half-open state, then we need to snap to the closed state
        // when the keyboard is dismissed by the user
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            if (sheetIndex === 1) bottomSheetRef.current?.snapToIndex(0);
        });
        return () => keyboardDidHideListener.remove();
    }, [sheetIndex]);

    // Present the bottom sheet when it is not open and the user navigates to the chat screen
    useEffect(() => {
        if (bottomSheetRef.current) bottomSheetRef.current.present();
    }, [bottomSheetRef.current]);

    return (
        <>
            <AttachmentsContainer attachmentHandler={attachmentHandler} />
            <GestureHandlerRootView >
                <BottomSheetModal
                    ref={bottomSheetRef}
                    index={0}
                    snapPoints={snapPoints}
                    keyboardBehavior='extend'
                    enableDynamicSizing={false}
                    onChange={handleSheetChanges}
                    backgroundStyle={{ backgroundColor: '#1B1B1E', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 16 }}
                    handleComponent={HandleComponent}
                >
                    <Animated.View
                        ref={inputRef}
                        style={{ paddingTop: paddingAnim }}
                        className={'flex flex-col justify-between'}>
                        <BottomSheetTextInput
                            multiline={true}
                            placeholder="Enter your prompt"
                            placeholderTextColor="#9F9FA0"
                            className="text-white text-lg"
                            onFocus={() => {
                                bottomSheetRef.current?.snapToIndex(1);
                                setIsInputFocused(true);
                            }}
                            onBlur={() => {
                                setIsInputFocused(false);
                                bottomSheetRef.current?.snapToIndex(0);
                                Keyboard.dismiss();
                            }}
                            value={prompt}
                            onChangeText={setPrompt}
                            scrollEnabled={true}
                            style={{
                                textAlignVertical: 'top',
                                height: sheetIndex === 0 ? inputHeight : 'auto',
                                borderRadius: 16,
                                paddingHorizontal: 16,
                                marginBottom: bottomSheetPadding[sheetIndex],
                            }}
                        />
                        <ActionMenu
                            show={!isFullScreen && sheetIndex === 0}
                            attachmentHandler={attachmentHandler}
                        />
                    </Animated.View>
                </BottomSheetModal>
            </GestureHandlerRootView>
        </>
    );
};

const ATTACHMENTS_HEIGHT = 40 + 10; // height for the attachment items and the bottom padding
function AttachmentsContainer({ attachmentHandler }: { attachmentHandler: AttachmentInterface }) {
    const insets = useSafeAreaInsets();
    const getTopPosition = useCallback(() => {
        const snapPoint = parseInt(snapPointsDefault[0]) / 100;
        return screenDimensions.height - (screenDimensions.height * snapPoint) - insets.bottom - (ATTACHMENTS_HEIGHT * 0.5);
    }, [insets.bottom]);

    return (
        <View style={{ position: 'absolute', zIndex: 2, left: 0, top: getTopPosition(), height: ATTACHMENTS_HEIGHT }}>
            {attachmentHandler.renderAttachments()}
        </View>
    );
}
