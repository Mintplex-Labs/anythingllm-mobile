import { Text, View, Alert } from "react-native";
import React, { useEffect, useState } from "react";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";

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
            if (!url.toLowerCase().endsWith('.gguf')) throw new Error('The url must end with .gguf');
        } catch (error) {
            Alert.alert('An error occurred', `Error downloading model ${error instanceof Error ? error.message : 'Unknown error'}`);
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

            RNFS.downloadFile({
                fromUrl: url,
                toFile: localStorageDestination,
                progress: (res) => {
                    const progress = (res.bytesWritten / res.contentLength) * 100;
                    setProgress(Math.round(progress));
                }
            }).promise.then(() => {
                setProgress(100);
                setCompleted(true);
            }).finally(() => {
                setDownloading(false);
                setProgress(0);
            })
        } catch (error) {
            Alert.alert('An error occurred', `Error downloading model ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const { progress, downloading, startDownload, completed } = useDownloadModelFromUrl();

    useEffect(() => {
        if (!!downloadUrl) startDownload(downloadUrl);
    }, [downloadUrl]);

    useEffect(() => {
        if (completed) Alert.alert(
            'Model downloaded',
            'The model has been downloaded successfully',
            [
                {
                    text: 'Continue',
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