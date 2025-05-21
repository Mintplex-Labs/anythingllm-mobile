import {Image} from 'react-native';
import React, {useContext, useMemo, useState} from 'react';

import {FAB} from 'react-native-paper';

import {L10nContext} from '../../../utils';
import {styles} from './styles';

interface FABGroupProps {
  onAddHFModel: () => void;
  onAddLocalModel: () => void;
}

const HFIcon: React.FC<any> = props => (
  <Image
    source={require('../../../assets/icon-hf.png')}
    style={styles.icon}
    {...props}
  />
);

export const FABGroup: React.FC<FABGroupProps> = ({
  onAddHFModel,
  onAddLocalModel,
}) => {
  const [open, setOpen] = useState(false);
  const l10n = useContext(L10nContext);

  const onStateChange = ({open: isOpen}) => setOpen(isOpen);

  const actions = useMemo(
    () => [
      {
        testID: 'hf-fab',
        icon: HFIcon,
        label: l10n.models.buttons.addFromHuggingFace,
        onPress: () => {
          onAddHFModel();
        },
      },
      {
        testID: 'local-fab',
        icon: 'folder-plus',
        label: l10n.models.buttons.addLocalModel,
        onPress: () => {
          onAddLocalModel();
        },
      },
    ],
    [l10n, onAddHFModel, onAddLocalModel],
  );

  return (
    <FAB.Group
      testID="fab-group"
      open={open}
      visible={true}
      icon={open ? 'close' : 'plus'}
      actions={actions}
      onStateChange={onStateChange}
      onPress={() => {
        if (open) {
          console.log('FAB Group closed');
        } else {
          console.log('FAB Group opened');
        }
      }}
      fabStyle={styles.fab}
      accessibilityLabel={open ? 'Close menu' : 'Open menu'}
    />
  );
};
