import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      height: 46,
      backgroundColor: 'transparent',
      paddingRight: 16,
      paddingLeft: 16,
      maxWidth: 'auto',
    },
    leadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    contentContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      marginLeft: 10,
      marginRight: 10,
      maxWidth: 'auto',
      flexGrow: 1,
    },
    noLeadingIcon: {
      marginLeft: 0,
    },
    noTrailingIcon: {
      marginRight: 0,
    },
    label: {
      ...theme.fonts.titleSmall,
      textAlign: 'left',
      paddingLeft: 0,
    },
    labelDisabled: {
      opacity: 0.5,
    },
    itemDisabled: {
      opacity: 0.5,
    },
    trailingContainer: {
      alignItems: 'flex-end',
    },
    groupLabel: {
      paddingTop: 12,
      opacity: 0.5,
    },
    activeParent: {
      backgroundColor: theme.colors.menuBackgroundActive,
    },
  });
