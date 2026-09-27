import { useEffect, useState } from 'react';
import uiStore from '@/store/UIStore';
import { tKey } from '@/i18n';
import { isOnDeviceProviderName } from '@/utils/ToolsManager/providerGuards';
import { type JobsBlockedReason } from '@/utils/ScheduledJobs/runner';

/**
 * Whether scheduled jobs can run with the saved LLM preference, kept in sync with changes made in
 * settings. Jobs need an external (cloud or self-hosted) provider - the on-device model cannot be
 * loaded in the background.
 */
export default function useJobsBlockedReason(): { blocked: JobsBlockedReason; loading: boolean } {
    const [blocked, setBlocked] = useState<JobsBlockedReason>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const evaluate = (provider?: string) => {
            if (cancelled) return;
            if (!provider || provider === 'unknown') setBlocked('no_provider');
            else if (isOnDeviceProviderName(provider)) setBlocked('on_device_provider');
            else setBlocked(null);
            setLoading(false);
        };
        uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} }).then((preferences) => evaluate(preferences?.provider));
        const listener = uiStore.emitter.addListener('llmPreference', (event: { details?: { provider?: string } }) => evaluate(event?.details?.provider));
        return () => {
            cancelled = true;
            listener.remove();
        };
    }, []);

    return { blocked, loading };
}

/** Translation keys - resolve with t() when rendering */
export const BLOCKED_COPY: Record<Exclude<JobsBlockedReason, null>, { title: string; body: string }> = {
    no_provider: {
        title: tKey('scheduled_jobs.blocked.no_provider_title'),
        body: tKey('scheduled_jobs.blocked.no_provider_body'),
    },
    on_device_provider: {
        title: tKey('scheduled_jobs.blocked.on_device_title'),
        body: tKey('scheduled_jobs.blocked.on_device_body'),
    },
};
