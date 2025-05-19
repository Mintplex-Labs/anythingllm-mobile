import {View} from 'react-native';
import React, {useMemo} from 'react';

import {marked} from 'marked';
import RenderHtml, {
  defaultSystemFonts,
  HTMLContentModel,
  HTMLElementModel,
} from 'react-native-render-html';

import {useTheme} from '../../hooks';
import {ThinkingBubble} from '../ThinkingBubble';

import {createTagsStyles} from './styles';

marked.use({
  langPrefix: 'language-',
  mangle: false,
  headerIds: false,
});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  //isComplete: boolean; // indicating if message is complete
  selectable?: boolean;
}

// Helper function to check if content is empty
const isEmptyContent = (content: string): boolean => {
  console.log('isEmptyContent: ', content);
  return !content || content.trim() === '';
};

const ThinkingRenderer = ({TDefaultRenderer, ...props}: any) => {
  // Check if the content is empty
  const content = props.tnode?.domNode?.children?.[0]?.data || '';
  // If content is empty, don't render the ThinkingBubble
  if (isEmptyContent(content)) {
    return null;
  }

  return (
    <ThinkingBubble>
      <TDefaultRenderer {...props} />
    </ThinkingBubble>
  );
};

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth, selectable = false}) => {
    const _maxWidth = maxMessageWidth;

    const theme = useTheme();
    const tagsStyles = useMemo(() => createTagsStyles(theme), [theme]);

    const customHTMLElementModels = useMemo(
      () => ({
        think: HTMLElementModel.fromCustomModel({
          tagName: 'think',
          contentModel: HTMLContentModel.block,
        }),
        thought: HTMLElementModel.fromCustomModel({
          tagName: 'thought',
          contentModel: HTMLContentModel.block,
        }),
        thinking: HTMLElementModel.fromCustomModel({
          tagName: 'thinking',
          contentModel: HTMLContentModel.block,
        }),
      }),
      [],
    );

    const renderers = useMemo(
      () => ({
        think: (props: any) => ThinkingRenderer(props),
        thought: (props: any) => ThinkingRenderer(props),
        thinking: (props: any) => ThinkingRenderer(props),
      }),
      [],
    );

    const defaultTextProps = useMemo(
      () => ({
        selectable,
        userSelect: selectable ? 'text' : 'none',
      }),
      [selectable],
    );
    const systemFonts = useMemo(() => defaultSystemFonts, []);

    const contentWidth = useMemo(() => _maxWidth, [_maxWidth]);

    const htmlContent = useMemo(() => marked(markdownText), [markdownText]);
    const source = useMemo(() => ({html: htmlContent}), [htmlContent]);

    return (
      <View testID="chatMarkdownScrollView" style={{maxWidth: _maxWidth}}>
        <RenderHtml
          contentWidth={contentWidth}
          source={source}
          tagsStyles={tagsStyles}
          defaultTextProps={defaultTextProps}
          systemFonts={systemFonts}
          customHTMLElementModels={customHTMLElementModels}
          renderers={renderers}
        />
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    //prevProps.isComplete === nextProps.isComplete &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable,
);
