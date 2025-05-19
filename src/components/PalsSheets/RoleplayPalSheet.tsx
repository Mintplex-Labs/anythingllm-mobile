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
import {SectionDivider} from './SectionDivider';
import {createSchemaWithL10n, PalType, type RoleplayFormData} from './types';
import {generateRoleplayPrompt} from './utils';

interface RoleplayPalSheetProps {
  isVisible: boolean;
  onClose: () => void;
  editPal?: RoleplayFormData & {id: string};
}

const INITIAL_STATE: Omit<RoleplayFormData, 'palType'> = {
  name: '',
  defaultModel: undefined,
  world: '',
  location: '',
  aiRole: '',
  userRole: '',
  situation: '',
  toneStyle: '',
  useAIPrompt: false,
  systemPrompt: '',
  isSystemPromptChanged: false,
  color: undefined,
  promptGenerationModel: undefined,
  generatingPrompt: '',
};

export const RoleplayPalSheet: React.FC<RoleplayPalSheetProps> = observer(
  ({isVisible, onClose, editPal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Create localized schema using current l10n context
    const schemas = useMemo(() => createSchemaWithL10n(l10n), [l10n]);
    const roleplayFormSchema = schemas.roleplaySchema;

    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});

    const methods = useForm<RoleplayFormData>({
      resolver: zodResolver(roleplayFormSchema),
      defaultValues: {...INITIAL_STATE, palType: PalType.ROLEPLAY},
    });

    const resetForm = useCallback(() => {
      if (editPal) {
        methods.reset(editPal);
      } else {
        methods.reset({...INITIAL_STATE, palType: PalType.ROLEPLAY});
      }
    }, [editPal, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    const validateRoleplayFields = async () => {
      let result = await methods.trigger([
        'world',
        'location',
        'aiRole',
        'userRole',
        'situation',
        'toneStyle',
      ]);

      const formState = methods.getValues();
      if (formState.useAIPrompt) {
        if (!formState.promptGenerationModel) {
          methods.setError('promptGenerationModel', {
            message:
              l10n.components.roleplayPalSheet.validation.promptModelRequired,
          });
          result = false;
        }
      }
      return result;
    };

    const onSubmit = (data: RoleplayFormData) => {
      if (editPal) {
        palStore.updatePal(editPal.id, data);
      } else {
        palStore.addPal(data);
      }
      handleClose();
    };

    const updateSystemPromptOnFormChange = () => {
      // Use this custom template if use AI to generate checkbox is off
      if (!methods.getValues().useAIPrompt) {
        const systemPrompt = generateRoleplayPrompt(methods.getValues());
        methods.setValue('systemPrompt', systemPrompt);
        methods.setValue('originalSystemPrompt', systemPrompt);
      }
    };

    return (
      <Sheet
        title={
          editPal
            ? l10n.components.roleplayPalSheet.title.edit
            : l10n.components.roleplayPalSheet.title.create
        }
        isVisible={isVisible}
        displayFullHeight
        onClose={handleClose}>
        <FormProvider {...methods}>
          <Sheet.ScrollView
            bottomOffset={16}
            contentContainerStyle={styles.scrollviewContainer}>
            <View style={styles.form}>
              <View
                testID="inner-form"
                style={styles.innerForm}
                // @ts-ignore
                onBlur={updateSystemPromptOnFormChange}>
                <FormField
                  ref={ref => (inputRefs.current.name = ref)}
                  name="name"
                  label={l10n.components.roleplayPalSheet.palName}
                  placeholder={
                    l10n.components.roleplayPalSheet.palNamePlaceholder
                  }
                  required
                  onSubmitEditing={() =>
                    inputRefs.current.defaultModel?.focus()
                  }
                />

                <Controller
                  name="defaultModel"
                  control={methods.control}
                  render={({field: {onChange, value}, fieldState: {error}}) => (
                    <ModelSelector
                      value={value}
                      onChange={onChange}
                      label={l10n.components.roleplayPalSheet.defaultModel}
                      placeholder={
                        l10n.components.roleplayPalSheet.defaultModelPlaceholder
                      }
                      error={!!error}
                      helperText={error?.message}
                      inputRef={ref => (inputRefs.current.defaultModel = ref)}
                      onSubmitEditing={() => inputRefs.current.world?.focus()}
                    />
                  )}
                />

                <SectionDivider
                  label={l10n.components.roleplayPalSheet.descriptionSection}
                />

                <FormField
                  ref={ref => (inputRefs.current.world = ref)}
                  name="world"
                  label={l10n.components.roleplayPalSheet.world}
                  placeholder={
                    l10n.components.roleplayPalSheet.worldPlaceholder
                  }
                  required
                  onSubmitEditing={() => inputRefs.current.location?.focus()}
                />

                <FormField
                  ref={ref => (inputRefs.current.location = ref)}
                  name="location"
                  label={l10n.components.roleplayPalSheet.location}
                  placeholder={
                    l10n.components.roleplayPalSheet.locationPlaceholder
                  }
                  sublabel={l10n.components.roleplayPalSheet.locationSublabel}
                  required
                  onSubmitEditing={() => inputRefs.current.aiRole?.focus()}
                />

                <FormField
                  ref={ref => (inputRefs.current.aiRole = ref)}
                  name="aiRole"
                  label={l10n.components.roleplayPalSheet.aiRole}
                  placeholder={
                    l10n.components.roleplayPalSheet.aiRolePlaceholder
                  }
                  sublabel={l10n.components.roleplayPalSheet.aiRoleSublabel}
                  required
                  onSubmitEditing={() => inputRefs.current.userRole?.focus()}
                />

                <FormField
                  ref={ref => (inputRefs.current.userRole = ref)}
                  name="userRole"
                  label={l10n.components.roleplayPalSheet.userRole}
                  placeholder={
                    l10n.components.roleplayPalSheet.userRolePlaceholder
                  }
                  sublabel={l10n.components.roleplayPalSheet.userRoleSublabel}
                  required
                  onSubmitEditing={() => inputRefs.current.situation?.focus()}
                />

                <FormField
                  ref={ref => (inputRefs.current.situation = ref)}
                  name="situation"
                  label={l10n.components.roleplayPalSheet.situation}
                  placeholder={
                    l10n.components.roleplayPalSheet.situationPlaceholder
                  }
                  required
                  onSubmitEditing={() => inputRefs.current.toneStyle?.focus()}
                />

                <FormField
                  ref={ref => (inputRefs.current.toneStyle = ref)}
                  name="toneStyle"
                  label={l10n.components.roleplayPalSheet.toneStyle}
                  placeholder={
                    l10n.components.roleplayPalSheet.toneStylePlaceholder
                  }
                  required
                />
              </View>

              <SystemPromptSection
                hideGeneratingPrompt
                validateFields={validateRoleplayFields}
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
                  : l10n.components.roleplayPalSheet.create}
              </Button>
            </View>
          </Sheet.Actions>
        </FormProvider>
      </Sheet>
    );
  },
);
