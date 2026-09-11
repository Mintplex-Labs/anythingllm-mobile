import { StyleSheet, View, Text } from "react-native";

export const markdownRules = {
    // Horizontal Rule
    hr: (node, _children, _parent, _styles) => (
        <View key={node.key} style={[{ backgroundColor: 'rgba(178,221,255,0.2)', height: 1 }]} />
    ),

    fence: (node, _children, _parent, _styles) => {
        return (
            <View key={node.key} style={{ borderRadius: 10, overflow: 'hidden', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }}>
                <View style={{ backgroundColor: '#1B1B1E', borderTopLeftRadius: 10, borderTopRightRadius: 10, padding: 5 }}>
                    <Text style={{ color: 'white', alignSelf: 'flex-end', fontSize: 12, fontFamily: 'monospace', opacity: 0.5 }}>{node?.sourceInfo || 'text'}</Text>
                </View>
                <Text style={{ color: 'white', padding: 5, paddingTop: 10, fontFamily: 'monospace', backgroundColor: '#222628', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>{node.content}</Text>
            </View>
        )
    }
}

/**
 * Styles for markdown elements that are overrides for styling
 * https://github.com/iamacup/react-native-markdown-display/blob/master/src/lib/styles.js
 */
const TABLE_BORDER = 'rgba(255,255,255,0.18)';

export const markdownStyles = StyleSheet.create({
    body: {
        color: 'white',
    },
    // `mergeStyle` is off, so each key below replaces the library's light-theme default entirely.
    code_inline: {
        color: 'white',
        backgroundColor: 'rgba(178,221,255,0.2)',
        borderRadius: 4,
        paddingHorizontal: 4,
        fontFamily: 'monospace',
    },
    code_block: {
        color: 'white',
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
    link: {
        color: '#7cd4fd',
        textDecorationLine: 'underline',
    },
    // Blockquote: default is a light grey box (#F5F5F5) which swallows the white text.
    blockquote: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: '#7cd4fd',
        borderLeftWidth: 3,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginVertical: 6,
    },
    // Tables: defaults draw black borders (#000) which vanish on the dark background.
    table: {
        borderWidth: 1,
        borderColor: TABLE_BORDER,
        borderRadius: 6,
        overflow: 'hidden',
        marginVertical: 8,
    },
    thead: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    th: {
        flex: 1,
        padding: 8,
        borderRightWidth: 1,
        borderColor: TABLE_BORDER,
    },
    tr: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: TABLE_BORDER,
    },
    td: {
        flex: 1,
        padding: 8,
        borderRightWidth: 1,
        borderColor: TABLE_BORDER,
    },
})