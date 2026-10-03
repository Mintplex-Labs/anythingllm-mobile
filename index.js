/**
 * @format
 */

import {AppRegistry} from 'react-native';
// Loaded first so Crashlytics' global error handler is in place before any app code runs.
import './src/utils/Telemetry';
// Web globals (URL, streams, TextEncoder, crypto, Buffer). Loaded here rather than only through App so the
// headless scheduled-jobs task, which never loads App, gets them too.
import './src/utils/polyfills';
// UI language: detected from the device on import, then switched to the one picked in Settings (if any).
import {hydrateLanguage} from './src/i18n';
import notifee from '@notifee/react-native';
import {name as appName} from './app.json';
import {runHeadlessScheduledJobs, SCHEDULED_JOBS_HEADLESS_TASK} from './src/utils/ScheduledJobs/scheduler';
import {BACKGROUND_WORK_KEEP_ALIVE_TASK, runBackgroundWorkKeepAlive} from './src/utils/BackgroundWork';

hydrateLanguage();

// Notifee requires a background handler to be registered at module scope. Taps on our
// notifications are handled in-app (`useNotificationTapNavigation`): while the app is alive they
// arrive as foreground events, and after a cold start via `getInitialNotification`.
notifee.onBackgroundEvent(async () => {});

// Scheduled jobs that come due while the app is closed. Android's WorkManager starts the React
// runtime without any UI and runs this task (see android/.../scheduledjobs/ScheduledJobsWorker.kt).
AppRegistry.registerHeadlessTask(SCHEDULED_JOBS_HEADLESS_TASK, () => runHeadlessScheduledJobs);

// Runs while long work (a browser agent session) is registered with BackgroundWork, so React Native keeps
// JS timers going while the app is in the background (see src/utils/BackgroundWork).
AppRegistry.registerHeadlessTask(BACKGROUND_WORK_KEEP_ALIVE_TASK, () => runBackgroundWorkKeepAlive);

// Root components are required inside the provider, not imported at the top. If a module in their import
// tree throws while loading, registration still happens and the error surfaces from runApplication with its
// real message and stack, instead of a generic `"AnythingLLM" has not been registered` crash that hides it.
AppRegistry.registerComponent(appName, () => require('./App').default);

// Quick Actions card (Android): the "Ask with AnythingLLM" entry in the text-selection toolbar of other apps.
// Rendered by quickcontext/QuickContextActivity.kt in the same JS runtime as the main app.
AppRegistry.registerComponent('AnythingLLMQuickContext', () => require('./src/quickContext/QuickContextApp').default);

// Digital assistant overlay (Android): opened by the assist gesture once AnythingLLM is the default assistant app.
// Rendered by assistant/AssistantActivity.kt in the same JS runtime as the main app.
AppRegistry.registerComponent('AnythingLLMAssistant', () => require('./src/assistant/AssistantApp').default);
