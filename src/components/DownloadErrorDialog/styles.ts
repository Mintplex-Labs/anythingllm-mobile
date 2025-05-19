import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    stepItem: {
      paddingVertical: 8,
      marginVertical: 2,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    textContainer: {
      flex: 1,
      marginLeft: 12,
    },
    stepText: {
      fontSize: 14,
    },
    errorDetails: {
      marginTop: 10,
      padding: 8,
      backgroundColor: theme.colors.errorContainer,
      borderRadius: 4,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
    },
    stepsContainer: {
      marginTop: 16,
    },
  });
