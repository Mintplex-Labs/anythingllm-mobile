import React, {
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';
import {Button} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useForm, FormProvider, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {Sheet} from '..';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {palStore} from '../../store';
import {FormField} from './FormField';
import {SystemPromptSection} from './SystemPromptSection';
import {ColorSection} from './ColorSection';
import {ModelSelector} from './ModelSelector';
import {createSchemaWithL10n, PalType, type AssistantFormData} from './types';
import {ModelNotAvailable} from './ModelNotAvailable';

interface AssistantPalSheetProps {
  isVisible: boolean;
  onClose: () => void;
  editPal?: AssistantFormData & {id: string};
}

const INITIAL_STATE: Omit<AssistantFormData, 'palType'> = {
  name: '',
  defaultModel: undefined,
  useAIPrompt: false,
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  color: undefined,
  promptGenerationModel: undefined,
  generatingPrompt: '',
};

export const AssistantPalSheet: React.FC<AssistantPalSheetProps> = observer(
  ({isVisible, onClose, editPal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Create localized schema using current l10n context
    const schemas = useMemo(() => createSchemaWithL10n(l10n), [l10n]);
    const assistantFormSchema = schemas.assistantSchema;

    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});

    const methods = useForm<AssistantFormData>({
      resolver: zodResolver(assistantFormSchema),
      defaultValues: {...INITIAL_STATE, palType: PalType.ASSISTANT},
    });

    useEffect(() => {
      if (editPal) {
        methods.reset(editPal);
      }
    }, [editPal, methods]);

    const validateAssistantFields = async () => {
      const formState = methods.getValues();
      if (formState.useAIPrompt) {
        if (!formState.generatingPrompt) {
          methods.setError('generatingPrompt', {
            message:
              l10n.components.assistantPalSheet.validation
                .generatingPromptRequired,
          });
        }
        if (!formState.promptGenerationModel) {
          methods.setError('promptGenerationModel', {
            message:
              l10n.components.assistantPalSheet.validation.promptModelRequired,
          });
        }
        return Boolean(
          formState.generatingPrompt && formState.promptGenerationModel,
        );
      }
      return true;
    };

    const resetForm = useCallback(() => {
      if (editPal) {
        methods.reset(editPal);
      } else {
        methods.reset({...INITIAL_STATE, palType: PalType.ASSISTANT});
      }
    }, [editPal, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    const onSubmit = (data: AssistantFormData) => {
      if (editPal) {
        palStore.updatePal(editPal.id, data);
      } else {
        palStore.addPal(data);
      }
      handleClose();
    };

    return (
      <Sheet
        title={
          editPal
            ? l10n.components.assistantPalSheet.title.edit
            : l10n.components.assistantPalSheet.title.create
        }
        isVisible={isVisible}
        displayFullHeight
        onClose={handleClose}>
        <FormProvider {...methods}>
          <Sheet.ScrollView
            bottomOffset={16}
            contentContainerStyle={styles.scrollviewContainer}>
            <View style={styles.form}>
              <FormField
                ref={ref => (inputRefs.current.name = ref)}
                name="name"
                label={l10n.components.assistantPalSheet.palName}
                placeholder={
                  l10n.components.assistantPalSheet.palNamePlaceholder
                }
                required
                onSubmitEditing={() => inputRefs.current.defaultModel?.focus()}
              />

              <Controller
                name="defaultModel"
                control={methods.control}
                render={({field: {onChange, value}, fieldState: {error}}) => (
                  <ModelSelector
                    value={value}
                    onChange={onChange}
                    label={l10n.components.assistantPalSheet.defaultModel}
                    placeholder={
                      l10n.components.assistantPalSheet.defaultModelPlaceholder
                    }
                    error={!!error}
                    helperText={error?.message}
                    inputRef={ref => (inputRefs.current.defaultModel = ref)}
                    onSubmitEditing={() =>
                      inputRefs.current.description?.focus()
                    }
                  />
                )}
              />

              <ModelNotAvailable
                model={editPal?.defaultModel}
                closeSheet={handleClose}
              />

              <SystemPromptSection
                validateFields={validateAssistantFields}
                closeSheet={handleClose}
              />
              <ColorSection />
            </View>
          </Sheet.ScrollView>

          <Sheet.Actions>
            <View style={styles.actions}>
              <Button
                style={styles.actionBtn}
                mode="text"
                onPress={handleClose}>
                {l10n.common.cancel}
              </Button>
              <Button
                style={styles.actionBtn}
                mode="contained"
                onPress={methods.handleSubmit(onSubmit)}>
                {editPal
                  ? l10n.common.save
                  : l10n.components.assistantPalSheet.create}
              </Button>
            </View>
          </Sheet.Actions>
        </FormProvider>
      </Sheet>
    );
  },
);
