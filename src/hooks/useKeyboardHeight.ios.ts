import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent } from 'react-native';

/**
 * Height of the keyboard, or 0 when it is hidden. iOS announces the keyboard before it moves, so
 * this updates as the slide starts and layouts can move with it instead of catching up afterwards.
 * @see useKeyboardHeight.ts
 */
function useKeyboardHeight() {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        const onShow = Keyboard.addListener('keyboardWillShow', (event: KeyboardEvent) => setKeyboardHeight(event.endCoordinates.height));
        const onHide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));

        return () => {
            onShow.remove();
            onHide.remove();
        };
    }, []);

    return keyboardHeight;
}

export default useKeyboardHeight;
