import React from 'react';
import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {RoleplayPalSheet} from '../RoleplayPalSheet';
import {palStore} from '../../../store';
import {generateRoleplayPrompt} from '../utils';
import {PalType} from '../types';
import {mockBasicModel} from '../../../../jest/fixtures/models';

jest.mock('../utils', () => ({
  generateRoleplayPrompt: jest.fn().mockReturnValue('Generated prompt'),
}));

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

describe('RoleplayPalSheet', () => {
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
      <RoleplayPalSheet {...defaultProps} />,
      {withNavigation: true},
    );

    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('sheet-title')).toBeTruthy();
    expect(queryByText('Create')).toBeTruthy(); // Should show create button in create mode
  });

  it('does not render when not visible', () => {
    const {queryByTestId} = render(
      <RoleplayPalSheet {...defaultProps} isVisible={false} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('shows edit title and save button in edit mode', () => {
    const editPal = {
      id: 'test-id',
      name: 'Test Roleplay',
      palType: PalType.ROLEPLAY as const,
      defaultModel: mockBasicModel,
      world: 'Fantasy world',
      location: 'Castle',
      aiRole: 'Knight',
      userRole: 'Squire',
      situation: 'Preparing for battle',
      toneStyle: 'Medieval formal',
      systemPrompt: 'Test system prompt',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#123456', '#123456'] as [string, string],
    };

    const {getByTestId, queryByText} = render(
      <RoleplayPalSheet {...defaultProps} editPal={editPal} />,
    );

    expect(getByTestId('sheet')).toBeTruthy();
    expect(queryByText('Save')).toBeTruthy(); // Should show save in edit mode
  });

  it('closes sheet when cancel button is pressed', () => {
    const {getByText} = render(<RoleplayPalSheet {...defaultProps} />);

    fireEvent.press(getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('adds a new pal when form is submitted in create mode', async () => {
    const {getByText, getByTestId} = render(
      <RoleplayPalSheet {...defaultProps} />,
    );

    // Check that the palStore is empty
    expect(palStore.getPals().length).toBe(0);

    const nameInput = getByTestId('form-field-name');
    fireEvent.changeText(nameInput, 'New Roleplay');

    const worldInput = getByTestId('form-field-world');
    fireEvent.changeText(worldInput, 'Fantasy world');

    const locationInput = getByTestId('form-field-location');
    fireEvent.changeText(locationInput, 'Castle');

    const aiRoleInput = getByTestId('form-field-aiRole');
    fireEvent.changeText(aiRoleInput, 'Knight');

    const userRoleInput = getByTestId('form-field-userRole');
    fireEvent.changeText(userRoleInput, 'Squire');

    const situationInput = getByTestId('form-field-situation');
    fireEvent.changeText(situationInput, 'Preparing for battle');

    const toneStyleInput = getByTestId('form-field-toneStyle');
    fireEvent.changeText(toneStyleInput, 'Medieval formal');

    const systemPromptInput = getByTestId('form-field-systemPrompt');
    fireEvent.changeText(systemPromptInput, 'Test system prompt');

    // Submit the form
    await act(async () => {
      fireEvent.press(getByText('Create'));
    });

    await waitFor(
      () => {
        // Check if a pal was added
        expect(palStore.getPals().length).toBe(1);
      },
      {timeout: 5000},
    );
  });

  it('updates an existing pal when form is submitted in edit mode', async () => {
    const editPal = {
      id: 'test-id',
      name: 'Test Roleplay',
      palType: PalType.ROLEPLAY as const,
      defaultModel: mockBasicModel,
      world: 'Fantasy world',
      location: 'Castle',
      aiRole: 'Knight',
      userRole: 'Squire',
      situation: 'Preparing for battle',
      toneStyle: 'Medieval formal',
      systemPrompt: 'Test system prompt',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#123456', '#123456'] as [string, string],
    };
    palStore.pals = [editPal];

    const {getByText, getByTestId} = render(
      <RoleplayPalSheet {...defaultProps} editPal={editPal} />,
      {withNavigation: true},
    );

    // Update a field
    const nameInput = getByTestId('form-field-name');
    fireEvent.changeText(nameInput, 'Updated Roleplay');

    // Submit the form
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });

    const updatedPal = palStore.getPals().find(pal => pal.id === editPal.id);
    expect(updatedPal?.name).toBe('Updated Roleplay');
  });

  it('generates a system prompt based on form fields', async () => {
    const {getByTestId, getAllByTestId} = render(
      <RoleplayPalSheet {...defaultProps} />,
    );

    // Fill in the roleplay form fields
    const formInputName = getByTestId('form-field-name');
    fireEvent.changeText(formInputName, 'Test Roleplay'); // name

    const worldInput = getByTestId('form-field-world');
    fireEvent.changeText(worldInput, 'Fantasy world');

    const locationInput = getByTestId('form-field-location');
    fireEvent.changeText(locationInput, 'Castle');

    const aiRoleInput = getByTestId('form-field-aiRole');
    fireEvent.changeText(aiRoleInput, 'Knight');

    const userRoleInput = getByTestId('form-field-userRole');
    fireEvent.changeText(userRoleInput, 'Squire');

    const situationInput = getByTestId('form-field-situation');
    fireEvent.changeText(situationInput, 'Preparing for battle');

    const toneStyleInput = getByTestId('form-field-toneStyle');
    fireEvent.changeText(toneStyleInput, 'Medieval formal');

    const colorInputs = getAllByTestId('color-button');
    fireEvent.press(colorInputs[0]);

    const formContainer = getByTestId('inner-form');
    await act(async () => {
      fireEvent(formContainer, 'blur');
    });

    const systemPromptInput = getByTestId('form-field-systemPrompt');
    await waitFor(() => {
      expect(systemPromptInput.props.value).toBe('Generated prompt');
    });
    expect(generateRoleplayPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Roleplay',
        world: 'Fantasy world',
        location: 'Castle',
        aiRole: 'Knight',
        userRole: 'Squire',
        situation: 'Preparing for battle',
        toneStyle: 'Medieval formal',
        useAIPrompt: false,
        isSystemPromptChanged: false,
        color: ['#858585', '#333333'] as [string, string],
      }),
    );
  });
});
