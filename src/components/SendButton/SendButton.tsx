import * as React from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

import {useTheme} from '../../hooks';

import {L10nContext} from '../../utils';
import {SendIcon} from '../../assets/icons';

export interface SendButtonPropsAdditionalProps {
  touchableOpacityProps?: TouchableOpacityProps;
  color?: string;
}

export interface SendButtonProps extends SendButtonPropsAdditionalProps {
  /** Callback for send button tap event */
  onPress: () => void;
}

export const SendButton = ({
  onPress,
  color,
  touchableOpacityProps,
}: SendButtonProps) => {
  const l10n = React.useContext(L10nContext);
  const theme = useTheme();
  const handlePress = (event: GestureResponderEvent) => {
    onPress();
    touchableOpacityProps?.onPress?.(event);
  };

  return (
    <TouchableOpacity
      accessibilityLabel={l10n.components.sendButton.accessibilityLabel}
      accessibilityRole="button"
      testID="send-button"
      {...touchableOpacityProps}
      onPress={handlePress}
      style={styles.sendButton}>
      {theme.icons?.sendButtonIcon?.() ?? (
        <SendIcon
          stroke={color ?? theme.colors.inverseOnSurface}
          width={24}
          height={24}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  sendButton: {
    marginLeft: 16,
  },
});
