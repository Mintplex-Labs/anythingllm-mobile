import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent } from 'react-native';

/**
 * Shows height of keyboard when shown
 * - Tested on Android
 * Sometimes we need to know the height of the keyboard to adjust the layout
 * since we cannot use the keyboardAvoidingView in BottomSheetModal - it just
 * messes everything up.
 */
function useKeyboardHeight() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    function onKeyboardShow(event: KeyboardEvent) {
        setKeyboardHeight(event.endCoordinates.height);
    }

    function onKeyboardHide() {
        setKeyboardHeight(0);
    }

    useEffect(() => {
        const onShow = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
        const onHide = Keyboard.addListener('keyboardDidHide', onKeyboardHide);

        return () => {
            onShow.remove();
            onHide.remove();
        };
    }, []);

    return keyboardHeight;
}

export default useKeyboardHeight;