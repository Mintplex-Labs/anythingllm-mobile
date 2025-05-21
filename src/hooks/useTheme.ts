import { useTheme as usePaperTheme, MD3Theme } from 'react-native-paper';
import uiStore from '@/store/UIStore';
import { Theme } from '@/utils/types';
import { darkTheme, lightTheme } from '@/utils/theme';

export default function useTheme(): Theme {
  const paperTheme = usePaperTheme<MD3Theme>();
  const theme = uiStore.colorScheme === 'dark' ? darkTheme : lightTheme;

  return {
    ...paperTheme,
    ...theme,
  } as Theme;
}
