import { NativeModules } from 'react-native';
import i18n from '@/i18n';
import { type ToolExecutionContext } from '@/utils/ToolsManager';
import ToolApproval from '@/utils/ToolsManager/toolApproval';
import { parseToolArgs, type StreamEmitter } from '../createFiles/shared';

type Args = {
    app: string;
};

/**
 * Launch another app on the phone ("open Spotify", "open Maps"). The model names the app
 * by its common name or package id; the native AppLauncherModule resolves it to a launchable
 * intent (package -> ACTION_VIEW URI -> installed-app label match) and fires it.
 *
 * Launching an app is a real side effect, so it is gated behind the standard tool-approval
 * card and never runs unattended (scheduled jobs).
 */
const tool = {
    id: 'openApp',
    get name() { return i18n.t('tools.open_app.name'); },
    get description() { return i18n.t('tools.open_app.description'); },
    defaultEnabled: true,
    category: 'appConnections' as const,
    hiddenFromScheduledJobs: true,
    supportsOnDevice: true,
    definition: {
        type: 'function' as const,
        function: {
            name: 'open_app',
            description:
                'Launch another app on the user\'s phone, eg: "open Spotify", "open Maps", "open Settings". ' +
                'Pass the app by its common name ("Spotify") or its package id ("com.spotify.music"). ' +
                'The user approves it before it opens.',
            parameters: {
                type: 'object' as const,
                properties: {
                    app: {
                        type: 'string',
                        description: 'The app to open, by common name (eg "Spotify") or package id (eg "com.spotify.music").',
                    },
                },
                required: ['app'] as const,
            },
        },
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: StreamEmitter, context: ToolExecutionContext = {}): Promise<string> {
        let app = '';
        try {
            if (context.autoApproveTools) return 'Apps cannot be opened from an unattended run. Ask the user to open it from a chat instead.';

            const parsed = parseToolArgs<Args>(args, { app: '' });
            app = String(parsed.app ?? '').trim();
            if (!app) return 'No app was named. Tell the user to say which app to open.';

            streamEmitter('report_status', i18n.t('tools.open_app.status_asking', { app }));
            const approval = await ToolApproval.request({
                skillName: this.definition.function.name,
                description: i18n.t('tools.open_app.approval', { app }),
                payload: { app },
                streamEmitter,
                signal: context.signal,
            });
            if (!approval.approved) {
                streamEmitter('report_status', i18n.t('tools.open_app.status_not_approved'));
                return `${approval.message} Nothing was opened.`;
            }

            const AppLauncher = NativeModules.AppLauncherModule;
            if (!AppLauncher?.launch) return 'App launching is not available on this device.';

            await AppLauncher.launch(app);
            streamEmitter('report_status', i18n.t('tools.open_app.status_opened', { app }));
            return `Opened ${app}. Confirm it briefly in one sentence.`;
        } catch (error: any) {
            console.error('[openApp] failed', error);
            if (error?.code === 'APP_NOT_FOUND') return `No app matching "${app}" is installed on this phone.`;
            return `Could not open the app: ${error?.message ?? 'unknown error'}.`;
        }
    },
};

export default tool;
