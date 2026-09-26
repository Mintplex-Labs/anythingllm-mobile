import { useCallback, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AwaitableAlert from '@/components/AwaitableAlert';
import mmprojDownloader, { MMPROJ_DOWNLOAD_EVENT, type MmprojDownloadState } from '@/utils/models/mmproj';
import uiStore from '@/store/UIStore';
import { formatBytes } from '@/utils/formatters';
import { type Model } from '@/utils/types';
import i18n from '@/i18n';

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
                i18n.t('downloads.no_internet_title'),
                i18n.t('downloads.no_internet_image_support'),
                { text: i18n.t('common.dismiss'), style: 'default' },
                { text: i18n.t('common.ok'), style: 'default' },
            );
            return false;
        }

        if (netInfo.type !== 'wifi') {
            const ignoreWarning = await AwaitableAlert(
                i18n.t('downloads.data_usage_title'),
                i18n.t('downloads.data_usage_image_support', { size }),
                { text: i18n.t('common.cancel'), style: 'cancel' },
                { text: i18n.t('downloads.continue_anyway'), style: 'default' },
            );
            if (!ignoreWarning) return false;
        }

        const shouldDownload = await AwaitableAlert(
            i18n.t('downloads.image_support_title'),
            i18n.t('downloads.image_support_message', { model: model.name, size }),
            { text: i18n.t('common.cancel'), style: 'cancel' },
            { text: i18n.t('downloads.continue_with_download'), style: 'default' },
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
