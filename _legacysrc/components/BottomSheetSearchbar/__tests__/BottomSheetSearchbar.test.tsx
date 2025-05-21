import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {BottomSheetSearchbar} from '../BottomSheetSearchbar';
import {useBottomSheetInternal} from '@gorhom/bottom-sheet';

jest.mock('@gorhom/bottom-sheet', () => ({
  useBottomSheetInternal: jest.fn(),
}));

describe('BottomSheetSearchbar', () => {
  const mockShouldHandleKeyboardEvents = {value: false};

  beforeEach(() => {
    (useBottomSheetInternal as jest.Mock).mockReturnValue({
      shouldHandleKeyboardEvents: mockShouldHandleKeyboardEvents,
    });
  });

  it('should handle focus event correctly', () => {
    const onFocus = jest.fn();
    const {getByTestId} = render(
      <BottomSheetSearchbar
        testID="searchbar"
        onFocus={onFocus}
        value="test"
      />,
    );

    fireEvent(getByTestId('searchbar'), 'focus');

    expect(mockShouldHandleKeyboardEvents.value).toBe(true);
    expect(onFocus).toHaveBeenCalled();
  });

  it('should handle blur event correctly', () => {
    const onBlur = jest.fn();
    const {getByTestId} = render(
      <BottomSheetSearchbar testID="searchbar" onBlur={onBlur} value="test" />,
    );

    fireEvent(getByTestId('searchbar'), 'blur');

    expect(mockShouldHandleKeyboardEvents.value).toBe(false);
    expect(onBlur).toHaveBeenCalled();
  });

  it('should reset keyboard events flag on unmount', () => {
    const {unmount} = render(<BottomSheetSearchbar value="test" />);

    unmount();

    expect(mockShouldHandleKeyboardEvents.value).toBe(false);
  });

  it('should forward props to Searchbar component', () => {
    const placeholder = 'Search...';
    const value = 'test';
    const onChangeText = jest.fn();

    const {getByPlaceholderText} = render(
      <BottomSheetSearchbar
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
      />,
    );

    const searchbar = getByPlaceholderText(placeholder);
    expect(searchbar.props.value).toBe(value);

    fireEvent.changeText(searchbar, 'new value');
    expect(onChangeText).toHaveBeenCalledWith('new value');
  });
});
