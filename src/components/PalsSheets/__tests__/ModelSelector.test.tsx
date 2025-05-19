import React from 'react';
import {render} from '../../../../jest/test-utils';
import {ModelSelector} from '../ModelSelector';
import {modelsList} from '../../../../jest/fixtures/models';

// Mock the modelStore
jest.mock('../../../store', () => ({
  modelStore: {
    availableModels: [
      {id: 'model1', name: 'Model 1'},
      {id: 'model2', name: 'Model 2'},
      {id: 'model3', name: 'Model 3'},
    ],
  },
}));

// Mock the Menu component
jest.mock('../../../components/Menu', () => {
  const {View} = require('react-native');
  return {
    Menu: ({visible, anchor, children}: any) => (
      <>
        {anchor}
        {visible && <View testID="menu-content">{children}</View>}
      </>
    ),
    'Menu.Item': ({label, onPress}: any) => (
      <View testID="menu-item" onPress={onPress}>
        {label}
      </View>
    ),
  };
});

describe('ModelSelector', () => {
  const defaultProps = {
    label: 'Select Model',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with required props', () => {
    const {getByText, getByPlaceholderText} = render(
      <ModelSelector {...defaultProps} />,
    );

    expect(getByText('Select Model')).toBeDefined();
    expect(getByPlaceholderText('Select model')).toBeDefined();
  });

  it('shows required asterisk when required prop is true', () => {
    const {getByText} = render(<ModelSelector {...defaultProps} required />);

    expect(getByText('Select Model*')).toBeDefined();
  });

  it('displays selected model name when value is provided', () => {
    const {getByTestId} = render(
      <ModelSelector {...defaultProps} value={modelsList[0]} />,
    );

    const input = getByTestId('text-input-flat');
    expect(input.props.value).toBe(modelsList[0].name);
  });

  it('displays helper text when provided', () => {
    const {getByText} = render(
      <ModelSelector {...defaultProps} helperText="Helper message" />,
    );

    expect(getByText('Helper message')).toBeDefined();
  });

  it('uses custom placeholder when provided', () => {
    const {getByPlaceholderText} = render(
      <ModelSelector {...defaultProps} placeholder="Custom placeholder" />,
    );

    expect(getByPlaceholderText('Custom placeholder')).toBeDefined();
  });
});
