import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 15,
      margin: 6,
      overflow: 'visible', // This ensures the badge can overflow the card
      position: 'relative',
      padding: 0,
    },
    hfBadge: {
      position: 'absolute',
      top: -11,
      right: -5,
      width: 24,
      height: 24,
      zIndex: 1,
      resizeMode: 'contain',
    },
    touchableRipple: {
      zIndex: 1,
    },
    cardInner: {},
    cardContent: {
      paddingTop: 8,
      paddingHorizontal: 15,
    },
    progressBar: {
      height: 8,
      borderRadius: 5,
      marginTop: 8,
    },
    actions: {
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    actionButton: {
      margin: 0,
    },
    settingsContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsButton: {
      flex: 1,
    },
    settingsChevron: {
      margin: 0,
      marginLeft: -12,
    },
    errorText: {
      textAlign: 'center',
      marginBottom: 8,
    },
    downloadSpeed: {
      textAlign: 'right',
      fontSize: 12,
      marginTop: 5,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    modelInfoContainer: {
      flex: 1,
      marginRight: 8,
    },
    modelName: {
      fontSize: 16,
      fontWeight: 'bold',
      flexDirection: 'row',
      alignItems: 'center',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    modelDescription: {
      fontSize: 12,
      marginVertical: 4,
      color: theme.colors.onSurfaceVariant,
    },
    skillsLabel: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.colors.primary,
      marginRight: 4,
    },
    skillsText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      flexShrink: 1,
    },
    skillsContainer: {
      marginTop: 4,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    hfButton: {
      margin: 0,
      padding: 0,
      zIndex: 2,
    },
    settings: {
      //paddingHorizontal: 15,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 0,
      marginTop: 8,
    },
    warningContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningIcon: {
      marginLeft: 0,
      marginRight: 2,
    },
    warningText: {
      color: theme.colors.error,
      fontSize: 12,
      flex: 1,
      flexWrap: 'wrap',
    },
    overlayButtons: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    downloadButton: {
      minWidth: 100,
      color: theme.colors.secondary,
    },
    removeButton: {
      minWidth: 100,
    },
    storageErrorText: {
      fontWeight: 'bold',
      marginHorizontal: 8,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      width: 100,
    },
    divider: {
      marginTop: 8,
    },
    sheetScrollViewContainer: {
      padding: 16,
    },
  });
