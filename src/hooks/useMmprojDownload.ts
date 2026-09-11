import { useCallback, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AwaitableAlert from '@/components/AwaitableAlert';
import mmprojDownloader, { MMPROJ_DOWNLOAD_EVENT, type MmprojDownloadState } from '@/utils/models/mmproj';
import uiStore from '@/store/UIStore';
import { formatBytes } from '@/utils/formatters';
import { type Model } from '@/utils/types';

export type MmprojDownload = {
    isDownloading: boolean;
    /** 0-100 while downloading */
    progress: number;
    status: MmprojDownloadState['status'];
    error: string | null;
    /** Confirms with the user (internet + Wi-Fi checks, same as a model download) then starts the download */
    requestDownload: () => Promise<boolean>;
    cancel: () => void;
};

/**
 * UI binding for `MmprojDownloader` - tracks the projector download for one model and runs the
 * confirmation alerts before starting it.
 */
export default function useMmprojDownload(model: Model | undefined): MmprojDownload {
    const modelId = model?.id ?? null;
    const [state, setState] = useState<MmprojDownloadState>(() =>
        modelId ? mmprojDownloader.stateFor(modelId) : { modelId: '', status: 'idle', progress: 0 },
    );

    useEffect(() => {
        if (!modelId) return;
        setState(mmprojDownloader.stateFor(modelId));
        const subscription = uiStore.emitter.addListener(MMPROJ_DOWNLOAD_EVENT, (next: MmprojDownloadState) => {
            if (next.modelId === modelId) setState(next);
        });
        return () => subscription.remove();
    }, [modelId]);

    const requestDownload = useCallback(async () => {
        if (!model?.mmproj) return false;
        const size = formatBytes(model.mmproj.size);
        const netInfo = await NetInfo.fetch();

        if (!netInfo.isConnected) {
            await AwaitableAlert(
                'No internet connection.',
                'You will need to be connected to the internet to download image support.',
                { text: 'Dismiss', style: 'default' },
                { text: 'OK', style: 'default' },
            );
            return false;
        }

        if (netInfo.type !== 'wifi') {
            const ignoreWarning = await AwaitableAlert(
                'Data usage warning',
                `We recommend using a Wi-Fi connection to download image support since it's ${size} in size.`,
                { text: 'Cancel', style: 'cancel' },
                { text: 'Continue Anyway', style: 'default' },
            );
            if (!ignoreWarning) return false;
        }

        const shouldDownload = await AwaitableAlert(
            'Download image support?',
            `${model.name} can understand photos once its image support file is downloaded. It is ${size} in size.`,
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue with download', style: 'default' },
        );
        if (!shouldDownload) return false;

        return mmprojDownloader.start(model);
    }, [model]);

    const cancel = useCallback(() => {
        if (modelId) mmprojDownloader.cancel(modelId);
    }, [modelId]);

    return {
        isDownloading: state.status === 'downloading',
        progress: state.progress,
        status: state.status,
        error: state.error ?? null,
        requestDownload,
        cancel,
    };
}
