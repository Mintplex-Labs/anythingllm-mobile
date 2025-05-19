import React, {forwardRef} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';
import {Text} from 'react-native-paper';
import {Controller, useFormContext} from 'react-hook-form';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {TextInput} from '../TextInput';
import type {AssistantFormData, RoleplayFormData} from './types';

type FormData = AssistantFormData | RoleplayFormData;

// Extract only string fields
type StringFields =
  | 'name'
  | 'systemPrompt'
  | 'generatingPrompt'
  | 'world'
  | 'location'
  | 'aiRole'
  | 'userRole'
  | 'situation'
  | 'toneStyle';

interface FormFieldProps {
  name: StringFields;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  sublabel?: string;
  disabled?: boolean;
  onSubmitEditing?: () => void;
}

const FormField = forwardRef<RNTextInput, FormFieldProps>(
  (
    {
      name,
      label,
      placeholder,
      multiline,
      required,
      sublabel,
      disabled,
      onSubmitEditing,
    },
    ref,
  ) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const {
      control,
      formState: {errors},
    } = useFormContext<FormData>();

    return (
      <View style={styles.field}>
        <Text style={theme.fonts.titleMediumLight}>
          {label}
          {required && '*'}
        </Text>
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
        <Controller
          control={control}
          name={name}
          render={({field: {onChange, value}}) => (
            <TextInput
              testID={`form-field-${name}`}
              ref={ref}
              value={value || ''}
              onChangeText={onChange}
              error={!!errors[name]}
              placeholder={placeholder}
              helperText={errors[name]?.message?.toString()}
              multiline={multiline}
              numberOfLines={multiline ? 5 : 1}
              editable={!disabled}
              onSubmitEditing={!multiline ? onSubmitEditing : undefined}
              returnKeyType={'default'}
            />
          )}
        />
      </View>
    );
  },
);

FormField.displayName = 'FormField';

export {FormField};
