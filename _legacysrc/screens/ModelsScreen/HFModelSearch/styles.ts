import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    bottomSheetHandle: {
      backgroundColor: theme.colors.primary,
      width: 40,
      height: 4,
    },
    bottomSheetBackground: {
      backgroundColor: theme.colors.background,
    },
  });
};
