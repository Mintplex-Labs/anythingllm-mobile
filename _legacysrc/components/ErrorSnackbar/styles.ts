import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    snackbar: {
      backgroundColor: theme.colors.errorContainer,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      marginRight: 8,
    },
    message: {
      color: theme.colors.onErrorContainer,
      flex: 1,
    },
    action: {
      marginRight: -8, // Offset Paper's internal padding
    },
    actionLabel: {
      color: theme.colors.primary,
    },
    wrapper: {
      zIndex: 9999,
    },
  });
