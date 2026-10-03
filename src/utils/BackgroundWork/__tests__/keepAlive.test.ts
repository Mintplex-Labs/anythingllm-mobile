jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key, on: jest.fn() } }));
import BackgroundWork, { runBackgroundWorkKeepAlive } from '@/utils/BackgroundWork';

const settled = async (promise: Promise<void>) => {
    let done = false;
    promise.then(() => { done = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return done;
};

describe('BackgroundWork keep-alive task', () => {
    test('runs until the last piece of work ends', async () => {
        await BackgroundWork.begin('a', { title: 't', body: 'b' });
        await BackgroundWork.begin('b', { title: 't', body: 'b' });
        const keepAlive = runBackgroundWorkKeepAlive();

        await BackgroundWork.end('a');
        expect(await settled(keepAlive)).toBe(false);

        await BackgroundWork.end('b');
        expect(await settled(keepAlive)).toBe(true);
    });

    test('ends right away when started after the work already finished', async () => {
        expect(await settled(runBackgroundWorkKeepAlive())).toBe(true);
    });
});
