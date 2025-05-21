import React from 'react';
import {View, TouchableOpacity} from 'react-native';

import {Icon} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

type Props = {
  testID?: string;
  checked: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
  children?: React.ReactNode;
};

export const Checkbox: React.FC<Props> = ({
  testID,
  checked,
  onPress,
  size = 20,
  disabled = false,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={styles.container}
      testID={testID ?? 'checkbox'}>
      <View
        style={[
          styles.checkbox,
          {width: size, height: size},
          checked ? styles.checkedBox : styles.uncheckedBox,
        ]}>
        {checked && (
          <Icon
            source="check"
            size={size * 0.7}
            color={theme.colors.surface}
            testID="check-icon"
          />
        )}
      </View>
      {children}
    </TouchableOpacity>
  );
};
