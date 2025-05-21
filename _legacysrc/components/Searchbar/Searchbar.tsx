import React from 'react';
import {StyleSheet} from 'react-native';

import {BlurView} from '@react-native-community/blur';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {Searchbar as PaperSearchbar} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {KeyboardStickyView} from 'react-native-keyboard-controller';

import {useTheme} from '../../hooks';

import {createStyles, iconStyles} from './styles';

interface SearchbarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  containerStyle?: object;
  inputStyle?: object;
  blurIntensity?: number;
  gradientLocations?: number[];
  showBlur?: boolean;
}

const SearchIcon = ({color}: {color: string}) => (
  <Icon name="magnify" size={24} color={color} style={iconStyles.searchIcon} />
);

const ClearIcon = ({color}: {color: string}) => (
  <Icon name="close" size={24} color={color} />
);

export const Searchbar = ({
  value,
  onChangeText,
  placeholder = 'Search...',
  containerStyle,
  inputStyle,
  blurIntensity = 4,
  gradientLocations = [0, 0.1, 1],
  showBlur = true,
}: SearchbarProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const searchIconSource = () => (
    <SearchIcon color={theme.colors.onSurfaceVariant} />
  );

  const clearIconSource = () => (
    <ClearIcon color={theme.colors.onSurfaceVariant} />
  );

  return (
    <KeyboardStickyView style={[styles.container, containerStyle]}>
      {showBlur ? (
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              style={StyleSheet.absoluteFill}
              colors={['transparent', 'black', 'black']}
              locations={gradientLocations}
              pointerEvents="none"
            />
          }>
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType={theme.dark ? 'dark' : 'light'}
            blurAmount={blurIntensity}
            reducedTransparencyFallbackColor={
              theme.dark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.85)'
            }
          />
        </MaskedView>
      ) : null}
      <PaperSearchbar
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        inputStyle={[styles.searchbarInput, inputStyle]}
        style={styles.searchbar}
        icon={searchIconSource}
        clearIcon={value.length > 0 ? clearIconSource : undefined}
      />
    </KeyboardStickyView>
  );
};
