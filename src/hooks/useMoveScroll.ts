// This is a workaround for multiline input text not avoiding the keyboard..
// https://github.com/facebook/react-native/issues/16826#issuecomment-2254322144

import {useRef, useEffect} from 'react';
import {FlatList, Keyboard, KeyboardEvent, Platform} from 'react-native';

export const useMoveScroll = () => {
  const scrollRef = useRef<FlatList>(null);
  const keyboardHeight = useRef(Platform.OS === 'ios' ? 320 : 280);
  const visibleAreaOffset = 300; // very arbitrary number. TODO: fix this

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (event: KeyboardEvent) => {
        keyboardHeight.current = event.endCoordinates.height;
      },
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  const moveScrollToDown = (inputY?: number) => {
    if (scrollRef.current) {
      setTimeout(() => {
        const offset = inputY ?? keyboardHeight.current + visibleAreaOffset;
        scrollRef.current?.scrollToOffset({
          offset: Math.max(0, offset),
          animated: true,
        });
      }, 600);
    }
  };

  return {scrollRef, moveScrollToDown};
};
