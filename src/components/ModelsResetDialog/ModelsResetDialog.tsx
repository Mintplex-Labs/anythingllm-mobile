import React, {useContext} from 'react';

import {observer} from 'mobx-react';
import {Portal, Dialog, Button, Text, Paragraph} from 'react-native-paper';

import {styles} from './styles';

import {L10nContext} from '../../utils';

type ModelsResetDialogProps = {
  testID?: string;
  visible: boolean;
  onDismiss: () => void;
  onReset: () => void;
};

export const ModelsResetDialog: React.FC<ModelsResetDialogProps> = observer(
  ({testID, visible, onDismiss, onReset}) => {
    const l10n = useContext(L10nContext);
    return (
      <Portal>
        <Dialog testID={testID} visible={visible} onDismiss={onDismiss}>
          <Dialog.Title>
            {l10n.components.modelsResetDialog.confirmReset}
          </Dialog.Title>
          <Dialog.Content>
            <Paragraph style={styles.paragraph}>
              This will reset model settings (
              <Text variant="labelMedium">
                'system prompt', 'chat template', 'temperature',
              </Text>
              etc.) to their default configuration.
            </Paragraph>

            <Paragraph style={styles.paragraph}>
              - Your downloaded models will <Text style={styles.bold}>not</Text>{' '}
              be removed.
            </Paragraph>

            <Paragraph style={styles.paragraph}>
              - Your 'Local Models' will remain intact.
            </Paragraph>

            {/*<Paragraph style={styles.paragraph}>
            - This action is <Text style={styles.bold}>irreversible.</Text>
          </Paragraph>*/}
          </Dialog.Content>
          <Dialog.Actions>
            <Button testID="cancel-reset-button" onPress={onDismiss}>
              {l10n.common.cancel}
            </Button>
            <Button testID="proceed-reset-button" onPress={onReset}>
              {l10n.components.modelsResetDialog.proceedWithReset}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    );
  },
);
