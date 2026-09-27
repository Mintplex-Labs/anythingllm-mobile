import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

export default function Error({ error }: { error: Error }) {
    const { t } = useTranslation();
    return (
        <View className="flex h-[80vh] justify-center items-center">
            <Text className="text-red-500">{t('chat.files.error_loading')}</Text>
            <Text className="text-red-500">{error?.message || t('chat.unknown_error')}</Text>
        </View>
    );
}