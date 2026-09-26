import { FolderSimple } from "phosphor-react-native";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

export default function Empty() {
    const { t } = useTranslation();
    return (
        <View className="flex justify-center items-center flex-col gap-[12px]">
            <FolderSimple size={52} color="#9F9FA0" />
            <Text style={{ color: '#9F9FA0' }} className="text-lg">{t('chat.files.empty')}</Text>
        </View>
    );
}