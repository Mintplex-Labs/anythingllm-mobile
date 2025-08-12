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
export const markdownStyles = StyleSheet.create({
    body: {
        color: 'white',
    },
    code_inline: {
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
    code_block: {
        backgroundColor: 'rgba(178,221,255,0.2)',
    },
})