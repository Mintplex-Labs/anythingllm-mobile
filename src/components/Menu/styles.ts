import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    menu: {
      shadowColor: 'rgba(0, 0, 0, 0.05)',
      shadowRadius: 70,
      shadowOffset: {width: 0, height: 0},
      elevation: 5,
      borderRadius: 12,
      maxWidth: '90%',
    },
    menuWithSubmenu: {
      elevation: 0,
      shadowOpacity: 0,
    },
    content: {
      paddingVertical: 0,
      backgroundColor: theme.colors.menuBackground,
      borderRadius: 12,
      // overflow: 'hidden', This removes shadow
      marginRight: 10,
    },
    contentWithSubmenu: {
      backgroundColor: theme.colors.menuBackground,
    },
    groupSeparator: {
      height: 6,
      flexShrink: 0,
      backgroundColor: 'transparent',
    },
    separator: {
      backgroundColor: theme.colors.menuSeparator,
    },
  });
