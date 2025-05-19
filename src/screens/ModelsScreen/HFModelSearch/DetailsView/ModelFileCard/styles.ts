import {StyleSheet} from 'react-native';

import {Theme} from '../../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    fileCardContainer: {
      marginVertical: 6,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 12,
      overflow: 'hidden', // Important for gradient containment
      position: 'relative', // For absolute positioning of gradient
    },
    gradientBackground: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      height: '100%', // Ensures full height
      borderRadius: 8,
    },
    fileContent: {
      padding: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      //marginBottom: 4,
    },
    fileInfo: {
      flex: 1,
      marginRight: 4,
    },
    fileName: {
      //fontSize: 14,
      color: theme.colors.onSurface,
      letterSpacing: -0.2,
    },
    metadataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    fileSize: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.9,
    },
    fileActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: -4,
    },
    downloadSpeed: {
      //fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      //fontWeight: '500',
    },
    fileSizeSeparator: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.5,
    },
    warningChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.errorContainer,
      borderRadius: 12,
      paddingVertical: 2,
      paddingHorizontal: 6,
      gap: 4,
    },
    warningIcon: {
      width: 14,
      height: 14,
      margin: 0,
    },
    warningText: {
      fontSize: 12,
      color: theme.colors.onErrorContainer,
      fontWeight: '500',
    },
    progressContainer: {
      marginTop: 8,
    },
    progressBar: {
      height: 2,
      backgroundColor: theme.colors.primary,
      opacity: 0.2,
      borderRadius: 1,
      overflow: 'hidden',
    },
    progressFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: theme.colors.primary,
      borderRadius: 1,
    },
    snackbarContent: {
      flexDirection: 'column',
      gap: 4,
    },
    snackbarText: {
      color: theme.colors.inverseOnSurface,
    },
    snackbarContainer: {
      marginBottom: 8,
      width: '90%',
      alignSelf: 'center',
    },
    gatedText: {
      color: theme.colors.primary,
      fontSize: 10,
    },
  });
