import React from 'react';
import type {TextInput as RNTextInput} from 'react-native';
import {fireEvent} from '@testing-library/react-native';
import {FormProvider, useForm} from 'react-hook-form';

import {render} from '../../../../jest/test-utils';
import {FormField} from '../FormField';
import type {AssistantFormData} from '../types';

const TestWrapper = ({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: Partial<AssistantFormData>;
}) => {
  const methods = useForm<AssistantFormData>({
    defaultValues: {
      name: '',
      systemPrompt: '',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      ...defaultValues,
    },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('FormField', () => {
  it('renders with required props', () => {
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper>
        <FormField name="name" label="Name" placeholder="Enter name" />
      </TestWrapper>,
    );

    expect(getByText('Name')).toBeDefined();
    expect(getByPlaceholderText('Enter name')).toBeDefined();
  });

  it('shows required asterisk when required prop is true', () => {
    const {getByText} = render(
      <TestWrapper>
        <FormField name="name" label="Name" required />
      </TestWrapper>,
    );

    expect(getByText('Name*')).toBeDefined();
  });

  it('shows sublabel when provided', () => {
    const {getByText} = render(
      <TestWrapper>
        <FormField
          name="name"
          label="Name"
          sublabel="This is a helpful description"
        />
      </TestWrapper>,
    );

    expect(getByText('This is a helpful description')).toBeDefined();
  });

  it('updates form value on text change', () => {
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <FormField name="name" label="Name" placeholder="Enter name" />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter name');
    fireEvent.changeText(input, 'Test Name');

    expect(input.props.value).toBe('Test Name');
  });

  it('shows error message when form has errors', () => {
    const TestComponent = () => {
      const methods = useForm<AssistantFormData>({
        defaultValues: {
          name: '',
          systemPrompt: '',
          useAIPrompt: false,
          isSystemPromptChanged: false,
        },
      });

      React.useEffect(() => {
        methods.setError('name', {
          type: 'manual',
          message: 'Name is required',
        });
      }, [methods]);

      return (
        <FormProvider {...methods}>
          <FormField name="name" label="Name" />
        </FormProvider>
      );
    };

    const {getByText} = render(<TestComponent />);
    expect(getByText('Name is required')).toBeDefined();
  });

  it('renders multiline input when multiline prop is true', () => {
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <FormField
          name="systemPrompt"
          label="System Prompt"
          placeholder="Enter prompt"
          multiline
        />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter prompt');
    expect(input.props.multiline).toBe(true);
    expect(input.props.numberOfLines).toBe(5);
  });

  it('calls onSubmitEditing when not multiline', () => {
    const onSubmitEditing = jest.fn();
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <FormField
          name="name"
          label="Name"
          placeholder="Enter name"
          onSubmitEditing={onSubmitEditing}
        />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter name');
    fireEvent(input, 'onSubmitEditing');
    expect(onSubmitEditing).toHaveBeenCalled();
  });

  it('does not pass onSubmitEditing when multiline', () => {
    const onSubmitEditing = jest.fn();
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <FormField
          name="systemPrompt"
          label="System Prompt"
          placeholder="Enter prompt"
          multiline
          onSubmitEditing={onSubmitEditing}
        />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter prompt');
    expect(input.props.onSubmitEditing).toBeUndefined();
  });

  it('disables input when disabled prop is true', () => {
    const {getByPlaceholderText} = render(
      <TestWrapper>
        <FormField name="name" label="Name" placeholder="Enter name" disabled />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter name');
    expect(input.props.editable).toBe(false);
  });

  it('handles empty or undefined values', () => {
    const {getByPlaceholderText} = render(
      <TestWrapper defaultValues={{name: undefined}}>
        <FormField name="name" label="Name" placeholder="Enter name" />
      </TestWrapper>,
    );

    const input = getByPlaceholderText('Enter name');
    expect(input.props.value).toBe('');
  });

  it('forwards ref to TextInput', () => {
    const ref = React.createRef<RNTextInput>();
    render(
      <TestWrapper>
        <FormField
          ref={ref}
          name="name"
          label="Name"
          placeholder="Enter name"
        />
      </TestWrapper>,
    );

    expect(ref.current).toBeTruthy();
  });
});
