import { View } from "react-native";

export const markdownRules = {
    // Horizontal Rule
    hr: (node, _children, _parent, _styles) => (
        <View key={node.key} style={[{ backgroundColor: 'rgba(178,221,255,0.2)', height: 1 }]} />
    ),
}