jest.mock('../native', () => ({
    BrowserNative: {
        start: jest.fn(async () => ({ profileId: 'default', profileName: 'Default' })),
        close: jest.fn(async () => true),
        navigate: jest.fn(async () => true),
        history: jest.fn(async () => true),
        status: jest.fn(),
        page: jest.fn(),
        tap: jest.fn(async () => true),
        drag: jest.fn(async () => true),
        capture: jest.fn(async () => 'thumb'),
        takeNotices: jest.fn(async () => []),
    },
}));

import BrowserSession from '../session';

const { BrowserNative: native } = jest.requireMock('../native');

/** A page that answers the page-script calls the session makes. `overrides` maps a call prefix to a reply. */
function fakePage(overrides: Record<string, any> = {}, { url = 'https://shop.example.com/' } = {}) {
    native.status.mockResolvedValue({ url, title: 'Shop', loading: false, crashed: false });
    native.page.mockImplementation(async (_id: string, call: string) => {
        for (const [prefix, reply] of Object.entries(overrides)) {
            if (call.startsWith(`window.__bu.${prefix}`)) return typeof reply === 'function' ? reply(call) : reply;
        }
        if (call.startsWith('window.__bu.snapshot')) return { url, title: 'Shop', scrollY: 0, maxScrollY: 100, lines: ['[1] button "Buy"'], truncated: 0, belowFold: 0, blocker: null };
        if (call.startsWith('window.__bu.domSize')) return 5_000;
        if (call.startsWith('window.__bu.favicon')) return '';
        if (call.startsWith('window.__bu.netMark')) return 10;
        if (call.startsWith('window.__bu.netSince')) return [];
        if (call.startsWith('window.__bu.fingerprint')) return Math.random().toString();
        return null;
    });
}

let session: BrowserSession;
beforeEach(async () => {
    jest.clearAllMocks();
    session = await BrowserSession.create({ id: 'session-1', profile: null });
});

describe('BrowserSession', () => {
    test('navigate opens the address and returns the page state', async () => {
        fakePage();
        const result = await session.run('navigate', { url: 'shop.example.com' });

        expect(native.navigate).toHaveBeenCalledWith('session-1', 'https://shop.example.com/');
        expect(result).toMatchObject({ ok: true, outcome: 'Opened https://shop.example.com/', page: { url: 'https://shop.example.com/', title: 'Shop' }, thumbnail: 'thumb' });
        expect(result.state).toContain('URL: https://shop.example.com/');
        expect(result.state).toContain('[1] button "Buy"');
    });

    test('navigate refuses an invalid address', async () => {
        fakePage();
        const result = await session.run('navigate', { url: 'ftp://files.example.com/a' });

        expect(native.navigate).not.toHaveBeenCalled();
        expect(result.ok).toBe(false);
        expect(result.outcome).toBe('Failed: "ftp://files.example.com/a" is not a valid web address.');
    });

    test('a navigate that lands elsewhere is passed to the snapshot as a redirect', async () => {
        fakePage({}, { url: 'https://shop.example.com/login' });
        await session.run('navigate', { url: 'https://shop.example.com/orders' });

        const snapshotCall = native.page.mock.calls.map((c: any[]) => c[1]).find((call: string) => call.startsWith('window.__bu.snapshot'));
        expect(snapshotCall).toContain('"redirected":true');
    });

    test('click taps the element and says when nothing changed or was sent', async () => {
        fakePage({
            locate: { x: 10, y: 20, vw: 400, tag: 'button', label: 'Buy' },
            fingerprint: 'same',
        });
        const result = await session.run('click', { id: 1 });

        expect(native.tap).toHaveBeenCalledWith('session-1', 10, 20, 400);
        expect(result.target).toBe('Buy');
        expect(result.outcome).toBe('Clicked [1] button "Buy" - but nothing on the page changed\nNothing was sent to the site.');
    });

    test('a click reports what the page really sent to the site, ignoring tracking, reads and other sites', async () => {
        fakePage({
            locate: { x: 10, y: 20, vw: 400, tag: 'button', label: 'Add to cart' },
            netSince: [
                { at: 11, method: 'POST', url: 'https://shop.example.com/api/cart/add', body: '{}', status: 200, ok: true },
                { at: 12, method: 'POST', url: 'https://shop.example.com/analytics/collect', body: '', status: 204, ok: true },
                { at: 13, method: 'POST', url: 'https://shop.example.com/graphql', body: '{"query":"query Cart { id }"}', status: 200, ok: true },
                { at: 14, method: 'POST', url: 'https://ads.other.com/pixel', body: '', status: 200, ok: true },
                { at: 15, method: 'POST', url: 'https://api.example.com/graphql', body: '{"operationName":"SaveForLater","query":"mutation"}', status: 500, ok: false },
            ],
        });
        const result = await session.run('click', { id: 1 });

        expect(result.sent).toEqual([
            { label: 'add', method: 'POST', target: 'shop.example.com/api/cart/add', status: 200, ok: true },
            { label: 'SaveForLater', method: 'POST', target: 'api.example.com/graphql', status: 500, ok: false },
        ]);
        expect(result.outcome).toContain('Sent to the site: POST shop.example.com/api/cart/add -> 200 OK; POST api.example.com/graphql (SaveForLater) -> 500 (failed)');
    });

    test('type checks the text went in, and flags password fields', async () => {
        fakePage({
            locate: { x: 1, y: 2, vw: 400, tag: 'input', label: 'Password', editable: true },
            prepareType: { ok: true },
            insertText: { ok: true },
            typedInto: { ok: true, password: true, field: 'Password', value: '' },
        });
        const result = await session.run('type', { id: 3, text: 'hunter2' });

        expect(result.ok).toBe(true);
        expect(result.sensitive).toBe(true);
        expect(result.outcome).toBe('Typed into the "Password" field (password field)');
    });

    test('type fails with a hint when the text did not go in', async () => {
        fakePage({
            locate: { x: 1, y: 2, vw: 400, tag: 'div', label: 'Search', editable: true },
            prepareType: { ok: true },
            insertText: { ok: true },
            typedInto: { ok: false, reason: 'the field is read-only' },
            textFieldHint: 'Try [4].',
        });
        const result = await session.run('type', { id: 3, text: 'widgets' });

        expect(result.ok).toBe(false);
        expect(result.outcome).toBe('Failed: The text did not go into [3] - the field is read-only. Nothing was typed. Try [4].');
    });

    test('type on a dropdown points at select_option', async () => {
        fakePage({ locate: { x: 1, y: 2, vw: 400, tag: 'select', label: 'Size', isSelect: true } });
        const result = await session.run('type', { id: 5, text: 'M' });

        expect(result.outcome).toBe('Failed: [5] is a dropdown. Use select_option instead.');
    });

    test('scroll falls back to JS scrolling when the drag did not move the page', async () => {
        let pos = 0;
        fakePage({
            scrollTarget: { x: 5, y: 6, vw: 400, pos: 0, panel: null },
            scrollPos: () => pos,
            scrollByJs: () => (pos = 600),
        });
        const result = await session.run('scroll', { direction: 'down' });

        expect(native.drag).toHaveBeenCalledWith('session-1', 5, 6, 600, 400);
        expect(result.outcome).toBe('Scrolled down');
    });

    test('go_back fails when there is no history', async () => {
        fakePage();
        native.history.mockResolvedValueOnce(false);
        const result = await session.run('go_back');

        expect(result.outcome).toBe('Failed: There is no previous page to go back to.');
    });

    test('read_page returns the text in place of the page state', async () => {
        fakePage({ read: 'The full article.' });
        const result = await session.run('read_page', { text_ids: [3, 4] });

        expect(result).toMatchObject({ ok: true, outcome: 'Read text T3, T4', state: 'The full article.', thumbnail: null });
    });

    test('a failed screenshot still returns the page state', async () => {
        fakePage();
        native.capture.mockResolvedValueOnce(null);
        const result = await session.run('screenshot');

        expect(result.ok).toBe(false);
        expect(result.outcome).toBe('Failed: The screen could not be captured.');
        expect(result.state).toContain('[1] button "Buy"');
    });

    test('the page state carries blocker and WebView notices', async () => {
        fakePage({ snapshot: { url: 'https://shop.example.com/', title: 'Sign in', scrollY: 0, maxScrollY: 0, lines: [], truncated: 2, belowFold: 1, blocker: { kind: 'login', wall: true, score: 9 } } });
        native.takeNotices.mockResolvedValueOnce(['A dialog said: "Hi"']);
        const result = await session.run('state');

        expect(result.blocker).toEqual({ kind: 'login', wall: true, score: 9 });
        expect(result.state).toContain('(no visible content)');
        expect(result.state).toContain('(3 more items further down');
        expect(result.state).toContain('Notices:\n- STOP: this is a sign-in page.');
        expect(result.state).toContain('- A dialog said: "Hi"');
    });

    test('tookOver is reported once after the user drove the browser', async () => {
        fakePage();
        session.takeOver();
        session.handBack();
        expect((await session.run('state')).tookOver).toBe(true);
        expect((await session.run('state')).tookOver).toBe(false);
    });
});
