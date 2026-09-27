/**
 * @format
 */

import {AppRegistry} from 'react-native';
// Loaded first so Crashlytics' global error handler is in place before any app code runs.
import './src/utils/Telemetry';
// UI language: detected from the device on import, then switched to the one picked in Settings (if any).
import {hydrateLanguage} from './src/i18n';
import notifee from '@notifee/react-native';
import App from './App';
import QuickContextApp from './src/quickContext/QuickContextApp';
import {name as appName} from './app.json';
import {runHeadlessScheduledJobs, SCHEDULED_JOBS_HEADLESS_TASK} from './src/utils/ScheduledJobs/scheduler';

hydrateLanguage();

// Notifee requires a background handler to be registered at module scope. Taps on our
// notifications are handled in-app (`useNotificationTapNavigation`): while the app is alive they
// arrive as foreground events, and after a cold start via `getInitialNotification`.
notifee.onBackgroundEvent(async () => {});

// Scheduled jobs that come due while the app is closed. Android's WorkManager starts the React
// runtime without any UI and runs this task (see android/.../scheduledjobs/ScheduledJobsWorker.kt).
AppRegistry.registerHeadlessTask(SCHEDULED_JOBS_HEADLESS_TASK, () => runHeadlessScheduledJobs);

AppRegistry.registerComponent(appName, () => App);

// Quick Actions card (Android): the "Ask with AnythingLLM" entry in the text-selection toolbar of other apps.
// Rendered by quickcontext/QuickContextActivity.kt in the same JS runtime as the main app.
AppRegistry.registerComponent('AnythingLLMQuickContext', () => QuickContextApp);
