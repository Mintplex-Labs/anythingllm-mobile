import { useEffect } from 'react';
import { Linking } from 'react-native';
import uiStore from '@/store/UIStore';
import { PATHS } from '@/utils/paths';
import { resetToWhenReady } from '@/utils/navigationRef';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import { parseHfRepoId } from '@/utils/api/hfGguf';

/**
 * `anythingllm://` deep links. The scheme is registered in AndroidManifest.xml (VIEW intent filter on
 * MainActivity) and Info.plist (CFBundleURLTypes); iOS forwards non-file URLs to RCTLinkingManager in
 * AppDelegate. Desktop registers the same scheme, so one link works wherever the user is browsing from.
 *
 * Supported links:
 *
 *   anythingllm://pull-hf?repo=<org/name>&file=<quant.gguf>
 *     Hugging Face "Use this model" -> switch to the on-device provider, open the Hugging Face picker on
 *     that repo and highlight the requested GGUF file. The user still confirms the download themselves.
 *     `repo` may also be a full huggingface.co url. `model` is accepted as an alias of `repo` (what the
 *     Hugging Face local-apps deeplink hands us) and `file` is optional.
 */

export const DEEP_LINK_SCHEME = 'anythingllm';
export const DEEP_LINK_ACTIONS = { PULL_HF: 'pull-hf' } as const;

/** A `pull-hf` link waiting for the on-device model settings to open and consume it. */
export type PendingHfPull = { repo: string; file: string | null };
const PENDING_HF_PULL_KEY = '@pendingHfPull';

export type ParsedDeepLink =
    | { action: typeof DEEP_LINK_ACTIONS.PULL_HF; repo: string; file: string | null }
    | null;

function log(message: string, ...args: any[]) {
    console.log(`\x1b[36m[DeepLinks]\x1b[0m ${message}`, ...args);
}

/** Hand-rolled query parsing - RN's URL/URLSearchParams are only partially implemented. */
function parseQuery(query: string): Record<string, string> {
    const params: Record<string, string> = {};
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const [rawKey, ...rest] = pair.split('=');
        const key = safeDecode(rawKey);
        if (!key) continue;
        params[key] = safeDecode(rest.join('='));
    }
    return params;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
}

/**
 * Break an `anythingllm://<action>?<query>` url into something we can act on, or null when the url is
 * not ours or not something we know how to handle.
 */
export function parseDeepLink(url: string | null | undefined): ParsedDeepLink {
    if (!url) return null;
    const match = url.trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i);
    if (!match) return null;
    const [, scheme, host, path, query = ''] = match;
    if (scheme.toLowerCase() !== DEEP_LINK_SCHEME) return null;

    // Accept both `anythingllm://pull-hf?...` and `anythingllm:///pull-hf?...`.
    const action = (host || path.replace(/^\/+/, '').split('/')[0] || '').toLowerCase();
    const params = parseQuery(query);

    if (action === DEEP_LINK_ACTIONS.PULL_HF) {
        const repo = parseHfRepoId(params.repo || params.model || '');
        if (!repo) return null;
        const file = (params.file || params.filepath || '').trim().split('/').pop() || null;
        return { action, repo, file };
    }

    return null;
}

/** Hold a `pull-hf` request for the on-device model settings screen. */
export function stashPendingHfPull(pull: PendingHfPull): void {
    uiStore.session.set(PENDING_HF_PULL_KEY, pull);
}

/** Look without consuming - lets the settings screen switch provider before the on-device options mount. */
export function peekPendingHfPull(): PendingHfPull | null {
    return (uiStore.session.get(PENDING_HF_PULL_KEY) as PendingHfPull | undefined) ?? null;
}

/** Take the pending request. Only the on-device options should call this, right before opening the picker. */
export function consumePendingHfPull(): PendingHfPull | null {
    const pending = peekPendingHfPull();
    if (pending) uiStore.session.delete(PENDING_HF_PULL_KEY);
    return pending;
}

/**
 * Act on a parsed link. Links that arrive before onboarding finished are declined - the settings screens
 * are not mounted yet and the onboarding flow already offers a model to download.
 */
export async function handleDeepLink(url: string | null | undefined): Promise<void> {
    const link = parseDeepLink(url);
    if (!link) {
        if (url) log('Ignoring unknown link', url);
        return;
    }

    const onboarded = await uiStore.getFromStorage('onboarding_data_handling_completed', false);
    if (!onboarded) {
        showToast('Finish setting up AnythingLLM before opening links to it', 'long');
        return;
    }

    if (link.action === DEEP_LINK_ACTIONS.PULL_HF) {
        log('Opening Hugging Face model from link', link.repo, link.file ?? '(no file)');
        Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.HF_PULL_LINK_OPENED, { repo: link.repo, hasFile: !!link.file });
        stashPendingHfPull({ repo: link.repo, file: link.file });
        // Same reset the sidebar uses to open Settings, straight onto the model selection page. The
        // page reads the pending pull, switches to the on-device provider and opens the picker.
        resetToWhenReady(PATHS.user_settings, { page: 'advanced_model_preferences' });
    }
}

/**
 * Listens for `anythingllm://` links for the lifetime of the root component: the url the app was cold
 * started with and any that arrive while it is running.
 */
export function useDeepLinkNavigation() {
    useEffect(() => {
        const subscription = Linking.addEventListener('url', ({ url }) => {
            handleDeepLink(url).catch((e) => log('failed to handle link', e));
        });
        Linking.getInitialURL()
            .then((url) => handleDeepLink(url))
            .catch((e) => log('failed to read launch url', e));
        return () => subscription.remove();
    }, []);
}
