import {View, Animated} from 'react-native';
import React, {useEffect, useRef} from 'react';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {Theme} from '../../utils/types';

interface LoadingDotProps {
  delay: number;
  theme: Theme;
}

const LoadingDot: React.FC<LoadingDotProps> = ({delay, theme}) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.3,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);

    Animated.loop(animation).start();
  }, [opacity, delay]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: theme.colors.outline,
          opacity,
        },
      ]}
    />
  );
};

export const LoadingBubble: React.FC = () => {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: theme.colors.surfaceVariant},
      ]}>
      <LoadingDot delay={0} theme={theme} />
      <LoadingDot delay={200} theme={theme} />
      <LoadingDot delay={400} theme={theme} />
    </View>
  );
};
