import { ActivityIndicator, View } from "react-native";

export default function Loading() {
    return (
        <View className="flex h-[80vh] justify-center items-center">
            <ActivityIndicator size="large" color="#fff" />
        </View>
    );
}