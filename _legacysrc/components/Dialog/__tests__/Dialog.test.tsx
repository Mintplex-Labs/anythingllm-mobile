import React from 'react';
import {fireEvent, render} from '../../../../jest/test-utils';
import {Dialog} from '../Dialog';
import {Text} from 'react-native';

describe('Dialog', () => {
  const defaultProps = {
    visible: true,
    onDismiss: jest.fn(),
    title: 'Test Dialog',
    actions: [
      {
        label: 'Cancel',
        onPress: jest.fn(),
      },
      {
        label: 'OK',
        onPress: jest.fn(),
      },
    ],
    children: <Text>Dialog content</Text>,
  };

  it('renders dialog with title and content', () => {
    const {getByText} = render(<Dialog {...defaultProps} />);

    expect(getByText('Test Dialog')).toBeDefined();
    expect(getByText('Dialog content')).toBeDefined();
  });

  it('renders action buttons and handles presses', () => {
    const {getByText} = render(<Dialog {...defaultProps} />);

    const cancelButton = getByText('Cancel');
    const okButton = getByText('OK');

    fireEvent.press(cancelButton);
    expect(defaultProps.actions[0].onPress).toHaveBeenCalled();

    fireEvent.press(okButton);
    expect(defaultProps.actions[1].onPress).toHaveBeenCalled();
  });

  it('does not render when visible is false', () => {
    const {queryByText} = render(<Dialog {...defaultProps} visible={false} />);

    expect(queryByText('Test Dialog')).toBeNull();
  });
});
