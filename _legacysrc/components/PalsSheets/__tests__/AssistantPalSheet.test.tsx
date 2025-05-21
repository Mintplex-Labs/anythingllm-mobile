import React, {act} from 'react';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {AssistantPalSheet} from '../AssistantPalSheet';
import {palStore} from '../../../store';
import {PalType} from '../types';
import {mockBasicModel} from '../../../../jest/fixtures/models';

jest.mock('../../Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

describe('AssistantPalSheet', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isVisible: true,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    palStore.pals = [];
  });

  it('renders correctly when visible', () => {
    const {getByTestId, queryByText} = render(
      <AssistantPalSheet {...defaultProps} isVisible={true} />,
      {withNavigation: true},
    );
    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('sheet-title')).toBeTruthy();
    expect(queryByText('Create')).toBeTruthy(); // Should show create button in create mode
  });

  it('does not render when not visible', () => {
    const {queryByTestId} = render(
      <AssistantPalSheet {...defaultProps} isVisible={false} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('shows edit title and save button in edit mode', () => {
    const editPal = {
      id: 'test-id',
      name: 'Test Assistant',
      palType: PalType.ASSISTANT as const, // use the enum value
      defaultModel: mockBasicModel,
      systemPrompt: 'Test system prompt',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#123456', '#123456'] as [string, string],
    };

    const {getByTestId, queryByText} = render(
      <AssistantPalSheet {...defaultProps} editPal={editPal} />,
      {withNavigation: true},
    );

    expect(getByTestId('sheet')).toBeTruthy();
    expect(queryByText('Save')).toBeTruthy(); // Should show save in edit mode
  });

  it('closes sheet when cancel button is pressed', () => {
    const {getByText} = render(<AssistantPalSheet {...defaultProps} />, {
      withNavigation: true,
    });

    fireEvent.press(getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('adds a new pal when form is submitted in create mode', async () => {
    const {getByText, getByTestId} = render(
      <AssistantPalSheet {...defaultProps} />,
      {withNavigation: true},
    );

    // Fill in required fields
    const nameInput = getByTestId('form-field-name');
    fireEvent.changeText(nameInput, 'New Assistant');

    const systemPromptInput = getByTestId('form-field-systemPrompt');
    fireEvent.changeText(systemPromptInput, 'You are a helpful assistant.');

    // Submit the form
    await act(async () => {
      fireEvent.press(getByText('Create'));
    });

    await waitFor(
      () => {
        // Check if a pal was added
        expect(palStore.getPals().length).toBeGreaterThan(0);
      },
      {timeout: 5000},
    );
  });

  it('updates an existing pal when form is submitted in edit mode', async () => {
    const editPal = {
      id: 'test-id',
      name: 'Test Assistant',
      palType: PalType.ASSISTANT as const,
      defaultModel: mockBasicModel,
      systemPrompt: 'Test system prompt',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#123456', '#123456'] as [string, string],
    };
    palStore.pals = [editPal];

    const {getByText, getByTestId, debug} = render(
      <AssistantPalSheet {...defaultProps} editPal={editPal} />,
      {withNavigation: true},
    );

    // Update a field
    const nameInput = getByTestId('form-field-name');
    fireEvent.changeText(nameInput, 'Updated Assistant');

    const systemPromptInput = getByTestId('form-field-systemPrompt');
    fireEvent.changeText(systemPromptInput, 'You are a helpful assistant.');
    debug();
    // Submit the form
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });

    await waitFor(() => {
      // Check if a pal was added
      expect(palStore.getPals().length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });

    const updatedPal = palStore.getPals().find(pal => pal.id === editPal.id);
    expect(updatedPal?.name).toBe('Updated Assistant');
    expect(updatedPal?.systemPrompt).toBe('You are a helpful assistant.');
  });
});
