import React from 'react';
import {Checkbox} from '../Checkbox';
import {fireEvent, render} from '../../../../jest/test-utils';

describe('Checkbox', () => {
  it('renders correctly in unchecked state', () => {
    const onPress = jest.fn();
    const {queryByTestId} = render(
      <Checkbox checked={false} onPress={onPress} />,
    );

    expect(queryByTestId('check-icon')).toBeNull();
  });

  it('renders correctly in checked state', async () => {
    const onPress = jest.fn();
    const {findByTestId} = render(
      <Checkbox checked={true} onPress={onPress} />,
    );

    const checkIcon = await findByTestId('check-icon', {
      includeHiddenElements: true,
    });
    expect(checkIcon).toBeDefined();
  });

  it('calls onPress when clicked and not disabled', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Checkbox checked={false} onPress={onPress} />,
    );

    fireEvent.press(getByTestId('checkbox'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Checkbox checked={false} onPress={onPress} disabled={true} />,
    );

    fireEvent.press(getByTestId('checkbox'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
