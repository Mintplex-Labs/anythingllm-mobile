import { CompletionParams } from 'cactus-react-native';
import { TemplateConfig } from 'chat-formatter';
import * as React from 'react';
import { ImageURISource, TextStyle } from 'react-native';
import { PreviewData } from '@flyerhq/react-native-link-preview';
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

export enum ModelOrigin {
  PRESET = 'preset',
  LOCAL = 'local',
  ANYTHINGLLM = 'anythingllm',
  HF = 'hf',
}

export interface ModelFile {
  rfilename: string;
  size?: number;
  url?: string;
  oid?: string;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
  canFitInStorage?: boolean;
}

export interface User {
  createdAt?: number;
  firstName?: string;
  id: string;
  imageUrl?: ImageURISource['uri'];
  lastName?: string;
  lastSeen?: number;
  metadata?: Record<string, any>;
  role?: 'admin' | 'agent' | 'moderator' | 'user';
  updatedAt?: number;
}

export interface ChatTemplateConfig extends TemplateConfig {
  addGenerationPrompt: boolean;
  systemPrompt?: string;
  name: string;
}

export type ChatMessage = {
  role: 'system' | 'assistant' | 'user';
  content: string;
};

export interface ModelFileDetails {
  type: string;
  oid: string;
  size: number;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
  path: string;
}

export interface GGUFSpecs {
  _id: string;
  id: string;
  gguf: {
    total: number;
    architecture: string;
    context_length: number;
    quantize_imatrix_file?: string;
    chat_template?: string;
    bos_token?: string;
    eos_token?: string;
  };
}

export interface HuggingFaceModel {
  _id: string;
  id: string;
  author: string;
  gated: boolean | string;
  inference: string;
  lastModified: string;
  likes: number;
  trendingScore: number;
  private: boolean;
  sha: string;
  downloads: number;
  tags: string[];
  library_name: string;
  createdAt: string;
  model_id: string;
  siblings: ModelFile[];
  url?: string;
  specs?: GGUFSpecs;
}

export interface Model {
  id: string;
  description?: string;
  ggufFilePath?: string;
  chatTemplateString?: string;
  imageUrl?: string;

  runtime: 'CPU' | 'NPU';
  author: string;
  name: string;
  type?: string;
  capabilities?: string[]; // Array of capability keys for localization
  size: number; // Size in bytes
  params: number;
  isDownloaded: boolean;
  downloadUrl: string;
  hfUrl: string;
  progress: number; // Progress as a percentage
  downloadSpeed?: string;
  filename: string;
  fullPath?: string; // Full path for local models
  /**
   * @deprecated Use 'origin' instead.
   */
  isLocal: boolean; // this need to be deprecated
  origin: ModelOrigin;
  defaultChatTemplate: ChatTemplateConfig;
  chatTemplate: ChatTemplateConfig;
  defaultStopWords: CompletionParams['stop'];
  stopWords: CompletionParams['stop'];
  defaultCompletionSettings: CompletionParams;
  completionSettings: CompletionParams;
  hfModelFile?: ModelFile;
  hfModel?: HuggingFaceModel;
  hash?: string;
}

export interface NPUEnabledModel {
  id: string;
  runtime: 'NPU';
  author: string;
  name: string;
  type?: string;
  capabilities?: string[];
  size: number;
  params: number;
  isDownloaded: boolean;
  downloadUrl: string;
  progress: number;
  downloadSpeed?: string;
  fullPath?: string;
  origin: ModelOrigin.ANYTHINGLLM;
  cdnUrls: string[];
  modelId: string;
  defaultChatTemplate: ChatTemplateConfig;
  chatTemplate: ChatTemplateConfig;
}

export namespace MessageType {
  export type Any = Custom | File | Image | Text | Unsupported;

  export type DerivedMessage =
    | DerivedCustom
    | DerivedFile
    | DerivedImage
    | DerivedText
    | DerivedUnsupported;
  export type DerivedAny = DateHeader | DerivedMessage;

  export type PartialAny =
    | PartialCustom
    | PartialFile
    | PartialImage
    | PartialText;

  interface Base {
    author: User;
    createdAt?: number;
    id: string;
    metadata?: Record<string, any>;
    roomId?: string;
    status?: 'delivered' | 'error' | 'seen' | 'sending' | 'sent';
    type: 'custom' | 'file' | 'image' | 'text' | 'unsupported';
    updatedAt?: number;
  }

  export interface DerivedMessageProps extends Base {
    nextMessageInGroup: boolean;
    // TODO: Check name?
    offset: number;
    showName: boolean;
    showStatus: boolean;
  }

  export interface DerivedCustom extends DerivedMessageProps, Custom {
    type: Custom['type'];
  }

  export interface DerivedFile extends DerivedMessageProps, File {
    type: File['type'];
  }

  export interface DerivedImage extends DerivedMessageProps, Image {
    type: Image['type'];
  }

  export interface DerivedText extends DerivedMessageProps, Text {
    type: Text['type'];
  }

  export interface DerivedUnsupported extends DerivedMessageProps, Unsupported {
    type: Unsupported['type'];
  }

  export interface PartialCustom extends Base {
    metadata?: Record<string, any>;
    type: 'custom';
  }

  export interface Custom extends Base, PartialCustom {
    type: 'custom';
  }

  export interface PartialFile {
    metadata?: Record<string, any>;
    mimeType?: string;
    name: string;
    size: number;
    type: 'file';
    uri: string;
  }

  export interface File extends Base, PartialFile {
    type: 'file';
  }

  export interface PartialImage {
    height?: number;
    metadata?: Record<string, any>;
    name: string;
    size: number;
    type: 'image';
    uri: string;
    width?: number;
  }

  export interface Image extends Base, PartialImage {
    type: 'image';
  }

  export interface PartialText {
    metadata?: Record<string, any>;
    previewData?: PreviewData;
    text: string;
    type: 'text';
  }

  export interface Text extends Base, PartialText {
    type: 'text';
  }

  export interface Unsupported extends Base {
    type: 'unsupported';
  }

  export interface DateHeader {
    id: string;
    text: string;
    type: 'dateHeader';
  }
}

export interface PreviewImage {
  id: string;
  uri: ImageURISource['uri'];
}

export enum CacheType {
  F16 = 'f16',
  F32 = 'f32',
  Q8_0 = 'q8_0',
  Q4_0 = 'q4_0',
  Q4_1 = 'q4_1',
  IQ4_NL = 'iq4_nl',
  Q5_0 = 'q5_0',
  Q5_1 = 'q5_1',
}

export interface HuggingFaceModelsResponse {
  models: HuggingFaceModel[];
  nextLink: string | null; // null if there is no next page
}
