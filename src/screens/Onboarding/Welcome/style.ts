import { StyleSheet } from 'react-native';
import { MD3Theme } from 'react-native-paper';

export const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    page: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.background,
    },
  });
