import {StyleSheet} from 'react-native';

import {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
      width: '100%',
      height: '100%',
      padding: 16,
    },
    scrollContent: {
      flexGrow: 1,
    },
    content: {
      padding: 16,
    },
    modelAuthor: {
      marginBottom: 8,
    },
    modelTitle: {
      fontWeight: 'bold',
      marginBottom: 16,
    },
    modelStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 24,
    },
    stat: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 16,
      marginBottom: 8,
      color: theme.colors.onSurface,
    },
  });
