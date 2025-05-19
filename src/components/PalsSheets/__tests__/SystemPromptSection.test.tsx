import React from 'react';
import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {FormProvider, useForm} from 'react-hook-form';
import {SystemPromptSection} from '../SystemPromptSection';
import {modelStore} from '../../../store';
import {useStructuredOutput} from '../../../hooks/useStructuredOutput';
import {PalType} from '../types';
import {modelsList} from '../../../../jest/fixtures/models';

// Mock the modelStore
jest.mock('../../../store', () => {
  const {
    modelsList: mockedModelsList,
  } = require('../../../../jest/fixtures/models');
  return {
    modelStore: {
      availableModels: [mockedModelsList[0], mockedModelsList[1]],
      isContextLoading: false,
      activeModelId: mockedModelsList[0].id,
      isDownloading: () => false,
      initContext: jest.fn(),
      models: mockedModelsList,
      isModelAvailable: (modelId?: string) => {
        if (!modelId) {
          return false;
        }
        return [mockedModelsList[0].id, mockedModelsList[1].id].includes(
          modelId,
        );
      },
    },
  };
});

// Mock useStructuredOutput hook
jest.mock('../../../hooks/useStructuredOutput', () => ({
  useStructuredOutput: jest.fn(),
}));

const TestWrapper = ({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: any;
}) => {
  const methods = useForm({
    defaultValues: {
      name: '',
      systemPrompt: '',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      palType: PalType.ASSISTANT,
      ...defaultValues,
    },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('SystemPromptSection', () => {
  const mockGenerate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useStructuredOutput as jest.Mock).mockReturnValue({
      generate: mockGenerate,
      isGenerating: false,
    });
  });

  it('renders basic fields correctly', () => {
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    expect(getByText('System Prompt')).toBeDefined();
    expect(getByText('Use AI to generate system prompt')).toBeDefined();
    expect(getByPlaceholderText('You are a helpful assistant')).toBeDefined();
  });

  it('toggles AI prompt generation fields visibility', () => {
    const {getByText, queryByText} = render(
      <TestWrapper defaultValues={{useAIPrompt: false}}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Initially, generation fields should be hidden
    expect(queryByText('Select Model for Generation*')).toBeNull();

    // Toggle AI prompt generation
    fireEvent.press(getByText('Use AI to generate system prompt'));

    // Generation fields should be visible
    expect(getByText('Select Model for Generation*')).toBeDefined();
  });

  it('handles system prompt generation for assistant type', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated assistant prompt'});

    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          palType: PalType.ASSISTANT,
          generatingPrompt: 'Test generating prompt',
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled();
      expect(
        getByPlaceholderText('You are a helpful assistant').props.value,
      ).toBe('Generated assistant prompt');
    });
  });

  it('handles system prompt generation for roleplay type', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated roleplay prompt'});

    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          palType: PalType.ROLEPLAY,
          world: 'Fantasy',
          location: 'Castle',
          aiRole: 'Wizard',
          userRole: 'Knight',
          situation: 'Quest',
          toneStyle: 'Medieval',
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled();
      expect(
        getByPlaceholderText('You are a helpful assistant').props.value,
      ).toBe('Generated roleplay prompt');
    });
  });

  it('handles validation before generation', async () => {
    const validateFields = jest.fn().mockResolvedValue(false);

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: 'model1',
        }}>
        <SystemPromptSection
          validateFields={validateFields}
          closeSheet={() => {}}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(validateFields).toHaveBeenCalled();
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  it('handles model initialization for generation', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated prompt'});

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[1], // Different from activeModelId
          palType: PalType.ASSISTANT,
          generatingPrompt: 'Test prompt',
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(modelStore.initContext).toHaveBeenCalledWith(modelsList[1]);
    });
  });

  it('shows system prompt changed warning and handles reset', () => {
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          systemPrompt: 'Changed prompt',
          originalSystemPrompt: 'Original prompt',
          isSystemPromptChanged: true,
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Check if warning is shown
    expect(getByText('System prompt has been manually changed')).toBeDefined();

    // Click reset button
    fireEvent.press(getByText('Reset'));

    // Check if prompt is reset
    expect(
      getByPlaceholderText('You are a helpful assistant').props.value,
    ).toBe('Original prompt');
  });

  it('disables generation when system prompt is manually changed', () => {
    const {getByTestId} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          isSystemPromptChanged: true,
          promptGenerationModel: modelsList[0],
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    const generateButton = getByTestId('generate-button');
    expect(generateButton.props.accessibilityState.disabled).toBe(true);
  });
});
