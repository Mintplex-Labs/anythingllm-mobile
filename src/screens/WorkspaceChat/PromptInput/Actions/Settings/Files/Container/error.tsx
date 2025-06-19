import { View, Text } from "react-native";

export default function Error({ error }: { error: Error }) {
    return (
        <View className="flex h-[80vh] justify-center items-center">
            <Text className="text-red-500">Error loading files</Text>
            <Text className="text-red-500">{error?.message || 'Unknown error'}</Text>
        </View>
    );
}