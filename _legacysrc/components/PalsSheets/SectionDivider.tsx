import React from 'react';
import {View} from 'react-native';
import {Text, Divider} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

interface SectionDividerProps {
  label: string;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({label}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View testID="section-divider-container" style={styles.dividerContainer}>
      <View testID="section-divider-content" style={styles.dividerContent}>
        <Text style={[theme.fonts.bodyMedium, styles.dividerLabel]}>
          {label}
        </Text>
        <View testID="section-divider-line" style={styles.dividerLine}>
          <Divider />
        </View>
      </View>
    </View>
  );
};
