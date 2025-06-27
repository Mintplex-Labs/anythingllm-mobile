import { StyleSheet, View } from "react-native";

export const markdownRules = {
    // Horizontal Rule
    hr: (node, _children, _parent, _styles) => (
        <View key={node.key} style={[{ backgroundColor: 'rgba(178,221,255,0.2)', height: 1 }]} />
    ),
}

/**
 * Styles for markdown elements that are overrides for styling
 * https://github.com/iamacup/react-native-markdown-display/blob/master/src/lib/styles.js
 */
export const markdownStyles = StyleSheet.create({
    code_inline: {
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
    code_block: {
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
    fence: {
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
})