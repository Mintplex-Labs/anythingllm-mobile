import * as React from 'react';
import { TextStyle } from 'react-native';
import { MD3Theme } from 'react-native-paper';
import { MD3Colors, MD3Typescale } from 'react-native-paper/lib/typescript/types';

export interface Size {
  height: number;
  width: number;
}

export interface MD3BaseColors extends MD3Colors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  // Additional MD3 required colors
  surfaceDisabled: string;
  onSurfaceDisabled: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  inverseSecondary: string;
  shadow: string;
  scrim: string;
}

export interface ThemeIcons {
  attachmentButtonIcon?: () => React.ReactNode;
  deliveredIcon?: () => React.ReactNode;
  documentIcon?: () => React.ReactNode;
  errorIcon?: () => React.ReactNode;
  seenIcon?: () => React.ReactNode;
  sendButtonIcon?: () => React.ReactNode;
  sendingIcon?: () => React.ReactNode;
}

export interface SemanticColors {
  // Surface variants
  surfaceContainerHighest: string;
  surfaceContainerHigh: string;
  surfaceContainer: string;
  surfaceContainerLow: string;
  surfaceContainerLowest: string;
  surfaceDim: string;
  surfaceBright: string;

  text: string;
  textSecondary: string;
  inverseText: string;
  inverseTextSecondary: string;

  border: string;
  placeholder: string;

  // Interactive states
  stateLayerOpacity: number;
  hoverStateOpacity: number;
  pressedStateOpacity: number;
  draggedStateOpacity: number;
  focusStateOpacity: number;

  // Menu specific
  menuBackground: string;
  menuBackgroundDimmed: string;
  menuBackgroundActive: string;
  menuSeparator: string;
  menuGroupSeparator: string;
  menuText: string;
  menuDangerText: string;

  // Message specific
  authorBubbleBackground: string;
  receivedMessageDocumentIcon: string;
  sentMessageDocumentIcon: string;
  userAvatarImageBackground: string;
  userAvatarNameColors: string[];
  searchBarBackground: string;

  // Thinking bubble specific
  thinkingBubbleBackground: string;
  thinkingBubbleText: string;
  thinkingBubbleBorder: string;
  thinkingBubbleShadow: string;
  thinkingBubbleChevronBackground: string;
  thinkingBubbleChevronBorder: string;
}

export interface ThemeBorders {
  inputBorderRadius: number;
  messageBorderRadius: number;
  default: number;
}

export interface ThemeFonts extends MD3Typescale {
  titleMediumLight: TextStyle;
  dateDividerTextStyle: TextStyle;
  emptyChatPlaceholderTextStyle: TextStyle;
  inputTextStyle: TextStyle;
  receivedMessageBodyTextStyle: TextStyle;
  receivedMessageCaptionTextStyle: TextStyle;
  receivedMessageLinkDescriptionTextStyle: TextStyle;
  receivedMessageLinkTitleTextStyle: TextStyle;
  sentMessageBodyTextStyle: TextStyle;
  sentMessageCaptionTextStyle: TextStyle;
  sentMessageLinkDescriptionTextStyle: TextStyle;
  sentMessageLinkTitleTextStyle: TextStyle;
  userAvatarTextStyle: TextStyle;
  userNameTextStyle: TextStyle;
}

export interface ThemeInsets {
  messageInsetsHorizontal: number;
  messageInsetsVertical: number;
}

export interface ThemeSpacing {
  default: number;
}

export interface AnythingLLMColorways {
  background: {
    primary: string;
    secondary: string;
  };
  text: {
    primary: string;
    secondary: string;
  };
  // catch all for any other colorways
  [key: string]: string | { [key: string]: string };
}

export interface Theme extends MD3Theme {
  colors: MD3BaseColors & SemanticColors & { anythingllm: AnythingLLMColorways };
  borders: ThemeBorders;
  spacing: ThemeSpacing;
  fonts: ThemeFonts;
  insets: ThemeInsets;
  icons?: ThemeIcons;
}
