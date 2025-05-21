import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';
import {EdgeInsets} from 'react-native-safe-area-context';

export const createStyles = (theme: Theme, insets: EdgeInsets) =>
  StyleSheet.create({
    scrollview: {
      backgroundColor: theme.colors.background,
    },
    palContainer: {
      gap: theme.spacing.default,
    },
    scrollviewContent: {
      padding: theme.spacing.default,
      paddingBottom: theme.spacing.default + insets.bottom,
    },
    createBtnsContainer: {
      gap: theme.spacing.default,
    },
    sectionTitle: {
      fontSize: 20,
      color: theme.colors.onSurface,
      marginBottom: 8,
    },
    itemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 54,
      paddingHorizontal: theme.spacing.default,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borders.default,
    },
    infoColumn: {
      flexDirection: 'column',
      paddingVertical: 10,
      minHeight: 40,
    },
    itemRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    itemDescription: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    divider: {
      marginVertical: theme.spacing.default,
      height: 1,
      backgroundColor: theme.colors.surface,
    },
    switch: {
      marginLeft: 8,
    },
    expandIcon: {
      marginLeft: 8,
    },
    expandedItem: {
      borderBottomStartRadius: 0,
      borderBottomEndRadius: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infoContainer: {
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.default,
      borderTopWidth: 1,
      borderTopColor: theme.colors.onPrimary,
    },
    palCard: {},
    iconBtn: {
      marginHorizontal: 0,
    },
    nameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    warningIcon: {
      margin: 0,
      padding: 0,
    },
  });
