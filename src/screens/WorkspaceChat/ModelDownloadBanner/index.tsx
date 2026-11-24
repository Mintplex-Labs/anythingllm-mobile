import { ActivityIndicator, Text, View } from "react-native";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import uiStore from "@/store/UIStore";

/**
 * Shown at the top of the chat while a model download is running. Onboarding lets the user into
 * chat before the model they picked has finished downloading, and the prompt stays locked until it does.
 */
export default observer(function ModelDownloadBanner() {
    const { t } = useTranslation();
    const download = uiStore.session.get('@downloadInProgress') as { progress: number } | undefined;
    if (!download) return null;

    return (
        <View className="mx-4 mt-2 rounded-xl px-3 py-3 flex flex-row items-center gap-3 bg-zinc-800">
            <ActivityIndicator size="small" color="#84CAFF" />
            <View className="flex-1 gap-1.5">
                <Text className="text-white text-sm font-medium">{t('chat.model_download.title', { progress: download.progress })}</Text>
                <Text className="text-xs text-zinc-400">{t('chat.model_download.description')}</Text>
                <View className="h-1 rounded-full overflow-hidden bg-zinc-700">
                    <View className="h-1 rounded-full bg-[#84CAFF]" style={{ width: `${download.progress}%` }} />
                </View>
            </View>
        </View>
    );
});
