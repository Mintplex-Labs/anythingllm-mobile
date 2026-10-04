import { AppState } from 'react-native';
import HelpNotifications from '../helpNotifications';

const notifications = { notifyBrowserNeedsHelp: jest.fn(async () => { }), clearBrowserNeedsHelp: jest.fn(async () => { }) };
// Jest here cannot run the lazy import() the app uses - hand the module over directly.
const load = async () => ({ default: notifications }) as any;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let changeListener: (state: string) => void;
beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
        changeListener = listener;
        return { remove: () => { } };
    }) as any);
});

const setAppState = (state: string) => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    changeListener(state);
};

describe('HelpNotifications', () => {
    test('a question asked while the app is in front does not notify', async () => {
        Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
        new HelpNotifications(() => [], load).asked('s1', 'Sign in?');
        await flush();
        expect(notifications.notifyBrowserNeedsHelp).not.toHaveBeenCalled();
    });

    test('going to the background reminds open questions once, and coming back clears them', async () => {
        const help = new HelpNotifications(() => [{ sessionId: 's1', question: 'Sign in?' }], load);
        setAppState('background');
        setAppState('background');
        await flush();
        expect(notifications.notifyBrowserNeedsHelp).toHaveBeenCalledTimes(1);
        expect(notifications.notifyBrowserNeedsHelp).toHaveBeenCalledWith('s1', 'Sign in?');

        setAppState('active');
        await flush();
        expect(notifications.clearBrowserNeedsHelp).toHaveBeenCalledWith('s1');
        help.clear('s1');
        await flush();
        expect(notifications.clearBrowserNeedsHelp).toHaveBeenCalledTimes(1);
    });

    test('a question asked in the background notifies right away', async () => {
        Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
        new HelpNotifications(() => [], load).asked('s2', 'Enter the code?');
        await flush();
        expect(notifications.notifyBrowserNeedsHelp).toHaveBeenCalledWith('s2', 'Enter the code?');
    });
});
