import React from 'react';
import {render} from '@testing-library/react-native';
import {Actions} from '../Actions';
import {Text} from 'react-native';

describe('Actions', () => {
  it('renders children correctly', () => {
    const {getByText} = render(
      <Actions>
        <Text>Cancel</Text>
        <Text>Save</Text>
      </Actions>,
    );

    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });
});
