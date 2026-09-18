/**
 * @format
 */

import {AppRegistry} from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import {name as appName} from './app.json';

// Notifee requires a background handler to be registered at module scope. Taps on our
// notifications are handled in-app (`useNotificationTapNavigation`): while the app is alive they
// arrive as foreground events, and after a cold start via `getInitialNotification`.
notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent(appName, () => App);
