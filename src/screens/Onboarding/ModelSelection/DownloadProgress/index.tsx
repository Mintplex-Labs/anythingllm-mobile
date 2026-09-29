import { Text, View, Alert } from "react-native";
import React, { useEffect, useState } from "react";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import { downloadFileAtomic } from "@/utils/fs/atomicDownload";
import { showToast } from "@/utils/Notification";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

/**
 * Hook to download a model from a url
 * @returns An object with the progress, downloading, completed, and startDownload functions
 */
function useDownloadModelFromUrl() {
    const [progress, setProgress] = useState(0);
    const [downloading, setDownloading] = useState(false);
    const [completed, setCompleted] = useState(false);

    async function startDownload(url: string) {
        setDownloading(true);
        setProgress(0);

        // Validate the url is a valid url
        // Validate the url ends with .gguf (for now)
        try {
            new URL(url);
            if (!url.toLowerCase().endsWith('.gguf')) throw new Error(i18n.t('onboarding.download.url_must_be_gguf'));
        } catch (error) {
            Alert.alert(i18n.t('onboarding.download.error_title'), i18n.t('onboarding.download.error_message', { error: error instanceof Error ? error.message : i18n.t('common.unknown_error') }));
            setDownloading(false);
            setProgress(0);
            return;
        }

        try {
            const localStorageDestination = resolveDestinationPathFromGGUFUrl(url);
            const fileExists = await RNFS.exists(localStorageDestination);

            if (fileExists) {
                console.log('Model already exists', localStorageDestination);
                setDownloading(false);
                setProgress(0);
                setCompleted(true);
                return;
            } else {
                const directory = localStorageDestination.split('/').slice(0, -1).join('/');
                console.log('Creating directory', directory);
                await RNFS.mkdir(directory);
            }

            console.log('Downloading model', {
                url,
                localStorageDestination,
            });

            // Android drops the connection once the app is backgrounded or the phone locks.
            showToast(i18n.t('downloads.keep_app_open'), 'long');
            downloadFileAtomic({
                fromUrl: url,
                toFile: localStorageDestination,
                progress: (res) => {
                    const progress = (res.bytesWritten / res.contentLength) * 100;
                    setProgress(Math.round(progress));
                }
            }).then(() => {
                setProgress(100);
                setCompleted(true);
            }).catch((error) => {
                Alert.alert(i18n.t('onboarding.download.error_title'), i18n.t('onboarding.download.error_message', { error: error instanceof Error ? error.message : i18n.t('common.unknown_error') }));
                setCompleted(false);
            }).finally(() => {
                setDownloading(false);
                setProgress(0);
            })
        } catch (error) {
            Alert.alert(i18n.t('onboarding.download.error_title'), i18n.t('onboarding.download.error_message', { error: error instanceof Error ? error.message : i18n.t('common.unknown_error') }));
            setCompleted(false);
            return;
        }
    }
    return { progress, downloading, startDownload, completed };
}

/**
 * A component that displays the progress of a download
 * @param downloadUrl - The url of the model
 * @param onComplete - A callback function to call when the download is complete
 * @returns A component that displays the progress of a download
 */
export default function DownloadProgress({ downloadUrl, onComplete }: { downloadUrl: string, onComplete: () => void }) {
    const { t } = useTranslation();
    const { progress, downloading, startDownload, completed } = useDownloadModelFromUrl();

    useEffect(() => {
        if (downloadUrl) startDownload(downloadUrl);
    }, [downloadUrl]);

    useEffect(() => {
        if (completed) Alert.alert(
            t('onboarding.download.success_title'),
            t('onboarding.download.success_message'),
            [
                {
                    text: t('common.continue'),
                    onPress: () => onComplete(),
                }
            ]
        );
    }, [completed]);

    if (!downloading) return null;
    return (
        <View className="flex flex-row gap-x-2">
            <Text className="text-white text-sm">{progress}%</Text>
        </View>
    )
}