import React, {memo, useCallback, forwardRef, useEffect} from 'react';
import type {NativeSyntheticEvent, TextInputFocusEventData} from 'react-native';

import {Searchbar} from 'react-native-paper';
import type {SearchbarProps} from 'react-native-paper';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';

interface BottomSheetSearchbarProps extends SearchbarProps {}

const BottomSheetSearchbarComponent = forwardRef<
  React.ComponentRef<typeof Searchbar>,
  BottomSheetSearchbarProps
>(({onFocus, onBlur, ...rest}, ref) => {
  //#region hooks
  const {shouldHandleKeyboardEvents} = useBottomSheetInternal();
  //#endregion

  //#region callbacks
  const handleOnFocus = useCallback(
    (args: NativeSyntheticEvent<TextInputFocusEventData>) => {
      shouldHandleKeyboardEvents.value = true;
      if (onFocus) {
        onFocus(args);
      }
    },
    [onFocus, shouldHandleKeyboardEvents],
  );

  const handleOnBlur = useCallback(
    (args: NativeSyntheticEvent<TextInputFocusEventData>) => {
      shouldHandleKeyboardEvents.value = false;
      if (onBlur) {
        onBlur(args);
      }
    },
    [onBlur, shouldHandleKeyboardEvents],
  );
  //#endregion

  //#region effects
  useEffect(() => {
    return () => {
      // Reset the flag on unmount
      shouldHandleKeyboardEvents.value = false;
    };
  }, [shouldHandleKeyboardEvents]);
  //#endregion

  return (
    <Searchbar
      ref={ref}
      onFocus={handleOnFocus}
      onBlur={handleOnBlur}
      {...rest}
    />
  );
});

const BottomSheetSearchbar = memo(BottomSheetSearchbarComponent);
BottomSheetSearchbar.displayName = 'BottomSheetSearchbar';

export {BottomSheetSearchbar};
export type {BottomSheetSearchbarProps};
