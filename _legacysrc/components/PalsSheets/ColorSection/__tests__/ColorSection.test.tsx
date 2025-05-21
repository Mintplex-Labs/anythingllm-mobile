import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {FormProvider, useForm, UseFormReturn} from 'react-hook-form';

import {render} from '../../../../../jest/test-utils';
import {ColorSection} from '../ColorSection';
import type {PalFormData} from '../../types';

const TestWrapper = ({
  children,
  onFormReady,
}: {
  children: React.ReactNode;
  onFormReady?: (methods: UseFormReturn<PalFormData>) => void;
}) => {
  const methods = useForm<PalFormData>({
    defaultValues: {
      color: ['#858585', '#333333'],
    },
  });

  React.useEffect(() => {
    onFormReady?.(methods);
  }, [onFormReady, methods]);

  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('ColorSection', () => {
  it('renders all color options', () => {
    const {getAllByTestId} = render(
      <TestWrapper>
        <ColorSection />
      </TestWrapper>,
    );

    const colorButtons = getAllByTestId('color-button');
    expect(colorButtons).toHaveLength(9); // Number of color pairs defined in component
  });

  it('shows selected state for default color', () => {
    const {getAllByTestId} = render(
      <TestWrapper>
        <ColorSection />
      </TestWrapper>,
    );

    const colorButtons = getAllByTestId('color-button');
    const selectedButton = colorButtons[0]; // First color pair should be selected by default
    const styles = selectedButton.props.style;
    expect(styles[1]).toBeTruthy(); // Selected style should be applied
  });

  it('changes selected color on press', () => {
    const {getAllByTestId} = render(
      <TestWrapper>
        <ColorSection />
      </TestWrapper>,
    );

    const colorButtons = getAllByTestId('color-button');
    const button = colorButtons[1].parent?.parent;
    if (button) {
      fireEvent.press(button); // Press second color option
    }

    // Check styles after re-render
    const updatedButtons = getAllByTestId('color-button');
    expect(updatedButtons[0].props.style[1]).toBeFalsy(); // First button should not have selected style
    expect(updatedButtons[1].props.style[1]).toBeTruthy(); // Second button should have selected style
  });

  it('updates form context on color selection', () => {
    let formMethods: UseFormReturn<PalFormData> | undefined;

    const {getAllByTestId} = render(
      <TestWrapper
        onFormReady={methods => {
          formMethods = methods;
        }}>
        <ColorSection />
      </TestWrapper>,
    );

    const colorButtons = getAllByTestId('color-button');
    const button = colorButtons[2].parent?.parent;
    if (button) {
      fireEvent.press(button); // Select third color option
    }

    // Check if form values were updated
    expect(formMethods?.getValues().color).toEqual(['#70A6F5', '#D9F2FF']); // Values for blue-light color pair
  });
});
