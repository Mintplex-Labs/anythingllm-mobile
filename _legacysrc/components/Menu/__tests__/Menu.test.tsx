import React from 'react';
import {render} from '../../../../jest/test-utils';
import {Menu} from '../Menu';

describe('Menu', () => {
  it('renders menu items correctly', () => {
    const {getByText} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Item label="Item 2" onPress={() => {}} />
      </Menu>,
    );

    expect(getByText('Item 1')).toBeTruthy();
    expect(getByText('Item 2')).toBeTruthy();
  });

  it('renders separators correctly', () => {
    const {UNSAFE_getAllByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Separator />
        <Menu.Item label="Item 2" onPress={() => {}} />
        <Menu.GroupSeparator />
        <Menu.Item label="Item 3" onPress={() => {}} />
      </Menu>,
    );

    const separators = UNSAFE_getAllByType(Menu.Separator);
    const groupSeparators = UNSAFE_getAllByType(Menu.GroupSeparator);

    expect(separators).toHaveLength(1);
    expect(groupSeparators).toHaveLength(1);
  });
});
