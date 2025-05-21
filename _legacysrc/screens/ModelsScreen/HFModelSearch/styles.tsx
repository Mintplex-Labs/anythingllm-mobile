import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // ... existing styles ...
    bottomSheetHandle: {
      backgroundColor: theme.colors.onSurface,
      opacity: 0.5,
    },
    bottomSheetBackground: {
      backgroundColor: theme.colors.background,
    },
  });
