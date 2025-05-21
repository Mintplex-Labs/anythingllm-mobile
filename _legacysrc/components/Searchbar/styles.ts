import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 10,
      paddingTop: 4,
      paddingBottom: 8,
      height: 65,
    },
    searchbar: {
      height: 44,
      borderRadius: 16,
      backgroundColor: theme.dark
        ? theme.colors.surfaceVariant + '80'
        : theme.colors.surface + '90',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
      shadowColor: theme.dark ? '#000' : 'rgba(0, 0, 0, 0.15)',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 2,
      zIndex: 1,
    },
    searchbarInput: {
      fontSize: 16,
      maxHeight: 44,
      minHeight: 44,
      height: 44,
      padding: 0,
      marginLeft: 8,
      color: theme.colors.onSurface,
      fontWeight: '400',
      letterSpacing: 0.25,
    },
  });

export const iconStyles = StyleSheet.create({
  searchIcon: {
    marginLeft: 4,
  },
});
