import { useCallback, useEffect, useState } from 'react';
import useLlmPreference from '@/hooks/useLLMPreference';
import OnDeviceProvider from '@/utils/AiProviders/onDevice';
import { MmprojDownloader } from '@/utils/models/mmproj';
import { type Model } from '@/utils/types';

export type VisionSupport = {
    /** True when the current provider/model can take an image with the prompt */
    supportsVision: boolean;
    /** Short user-facing explanation when `supportsVision` is false */
    reason: string | null;
    /**
     * On-device only: the selected model can see images but its projector (mmproj) has not been
     * downloaded yet. `model` is the catalog entry to hand to `useMmprojDownload`.
     */
    needsProjectorDownload: boolean;
    model: Model | undefined;
    /** Re-run the check (eg: when the attachments sheet is opened or a projector finished downloading) */
    refresh: () => void;
};

export const VISION_UNSUPPORTED_REASONS = {
    REMOTE: 'Images are not yet supported when chatting with a remote workspace.',
    NO_MODEL: 'Select a model to attach images.',
    ON_DEVICE: 'The selected on-device model cannot read images.',
    NEEDS_DOWNLOAD: 'This model can see images, but needs an additional download.',
} as const;

type State = Pick<VisionSupport, 'supportsVision' | 'reason' | 'needsProjectorDownload' | 'model'>;
const UNSUPPORTED = (reason: string, model?: Model): State => ({ supportsVision: false, reason, needsProjectorDownload: false, model });

/**
 * Decides whether the prompt may carry images for the current LLM selection.
 *
 * - Remote workspaces: never - the mobile API does not accept images yet.
 * - On-device: only when we are certain - the model must be flagged `vision` in our catalog and its
 *   mmproj projector must be downloaded (`OnDeviceProvider.modelSupportsVision`). A vision model
 *   without the projector reports `needsProjectorDownload` so the UI can offer the download.
 * - Every other provider (OpenAI, OpenRouter, Ollama, LM Studio, generic): assumed yes. If the chosen
 *   model turns out to be text-only the provider returns an error for that chat, which is acceptable.
 */
export default function useVisionSupport({ isRemote }: { isRemote: boolean }): VisionSupport {
    const { llmPreferences } = useLlmPreference();
    const [state, setState] = useState<State>(UNSUPPORTED(VISION_UNSUPPORTED_REASONS.NO_MODEL));
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let cancelled = false;
        async function check(): Promise<State> {
            if (isRemote) return UNSUPPORTED(VISION_UNSUPPORTED_REASONS.REMOTE);
            const provider = llmPreferences?.provider;
            const modelId = llmPreferences?.config?.model;
            if (!provider || provider === 'unknown' || !modelId) return UNSUPPORTED(VISION_UNSUPPORTED_REASONS.NO_MODEL);
            if (provider !== 'native') return { supportsVision: true, reason: null, needsProjectorDownload: false, model: undefined };

            const model = MmprojDownloader.definitionFor(modelId);
            if (await OnDeviceProvider.modelSupportsVision(modelId)) return { supportsVision: true, reason: null, needsProjectorDownload: false, model };
            const canSee = !!model?.capabilities?.includes('vision') && !!model?.mmproj;
            if (canSee) return { ...UNSUPPORTED(VISION_UNSUPPORTED_REASONS.NEEDS_DOWNLOAD, model), needsProjectorDownload: true };
            return UNSUPPORTED(VISION_UNSUPPORTED_REASONS.ON_DEVICE, model);
        }

        check()
            .catch(() => UNSUPPORTED(VISION_UNSUPPORTED_REASONS.ON_DEVICE))
            .then((result) => { if (!cancelled) setState(result); });
        return () => { cancelled = true; };
    }, [isRemote, llmPreferences?.provider, llmPreferences?.config?.model, tick]);

    return { ...state, refresh };
}
