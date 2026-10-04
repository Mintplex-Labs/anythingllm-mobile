jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string, options?: Record<string, any>) => (options ? `${key} ${JSON.stringify(options)}` : key) } }));
jest.mock('@/utils/constants', () => {
    let n = 0;
    return { generateUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('../traces', () => ({
    __esModule: true,
    default: { save: jest.fn(async () => { }), prune: jest.fn(async () => { }) },
    resumeUrlOf: (trace: any) => trace.userPage?.url || trace.steps.filter((s: any) => s.url).at(-1)?.url || null,
    sitesOf: (steps: any[] = []) => [...new Set(steps.filter((s) => s.url).map((s) => new URL(s.url).host))].map((host) => ({ host, favicon: null })),
}));

const mockSession = {
    profileName: 'Default',
    isTakenOver: false,
    run: jest.fn(),
    close: jest.fn(async () => { }),
    takeOver: jest.fn(),
    handBack: jest.fn(),
};
jest.mock('../session', () => ({
    __esModule: true,
    default: { create: jest.fn(async () => mockSession) },
}));

import { AppState } from 'react-native';
import BrowserAgent, { parseJsonAction, taskTerms } from '../agent';

const page = (url: string, state: string, extra: Record<string, any> = {}) => ({
    ok: true,
    outcome: `Opened ${url}`,
    state: `URL: ${url}\nTitle: Page\n\n${state}`,
    page: { url, title: 'Page', favicon: '' },
    thumbnail: null,
    ...extra,
});

let callId = 0;
const call = (name: string, args: Record<string, any> = {}) => ({
    textResponse: '',
    toolCalls: [{ id: `call_${++callId}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
    metrics: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, outputTps: 0, duration: 0 },
});
const text = (textResponse: string) => ({ textResponse, toolCalls: [], metrics: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70, outputTps: 0, duration: 0 } });

/** An LLM that answers from a script, recording what it was sent */
function scriptedLLM(replies: any[]) {
    const requests: { messages: any[]; tools: any[] }[] = [];
    return {
        requests,
        completeWithTools: jest.fn(async (messages: any[], tools: any[]) => {
            requests.push({ messages, tools });
            const next = replies.shift();
            if (!next) throw new Error('script ran out');
            return typeof next === 'function' ? next() : next;
        }),
    };
}

function makeAgent(llm: ReturnType<typeof scriptedLLM>, extra: Partial<ConstructorParameters<typeof BrowserAgent>[0]> = {}) {
    const updates: any[] = [];
    const agent = new BrowserAgent({
        llm,
        task: 'Find the price of the blue widget on example.com',
        profile: null,
        startUrl: 'https://example.com',
        workspace: null,
        model: 'test-model',
        contextLimit: 32_000,
        vision: false,
        onUpdate: (snapshot) => updates.push(snapshot),
        ...extra,
    });
    return { agent, updates };
}

beforeEach(() => {
    mockSession.run.mockReset();
    mockSession.isTakenOver = false;
});

describe('BrowserAgent', () => {
    test('opens the start page, acts, and returns the checked final answer', async () => {
        mockSession.run.mockImplementation(async (tool: string) => {
            if (tool === 'navigate') return page('https://example.com/', '[1] a "Blue widget" -> /widget\n[T1] Welcome');
            if (tool === 'click') return page('https://example.com/widget', '[T1] Blue widget\n[T2] Price $19.99', { outcome: 'Clicked [1] a "Blue widget"', target: 'Blue widget' });
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('click', { id: 1 }),
            call('done', { success: true, result: 'The blue widget costs $19.99.' }),
            text('COMPLETE\n\nThe blue widget costs $19.99 on example.com.'),
        ]);
        const { agent, updates } = makeAgent(llm);

        const result = await agent.run();

        expect(result).toContain('The browser task is complete.');
        expect(result).toContain('$19.99 on example.com');
        expect(mockSession.run).toHaveBeenCalledWith('navigate', { url: 'https://example.com' });
        expect(mockSession.run).toHaveBeenCalledWith('click', { id: 1 });
        expect(mockSession.close).toHaveBeenCalled();
        expect(updates.at(-1)).toMatchObject({ status: 'done', summary: 'The blue widget costs $19.99 on example.com.' });

        // The model sees its own call echoed back before the result, paired by id.
        const second = llm.requests[1].messages;
        const assistant = second.find((m: any) => m.role === 'assistant');
        const tool = second.find((m: any) => m.role === 'tool');
        expect(assistant.tool_calls[0].function.name).toBe('click');
        expect(tool.tool_call_id).toBe(assistant.tool_calls[0].id);
        expect(tool.content).toContain('Price $19.99');
        // Tool definitions are OpenAI shaped, and screenshot is not offered without vision.
        expect(llm.requests[0].tools[0]).toMatchObject({ type: 'function', function: { name: 'navigate' } });
        expect(llm.requests[0].tools.map((t: any) => t.function.name)).not.toContain('screenshot');
    });

    test('never types placeholder credentials', async () => {
        mockSession.run.mockImplementation(async (tool: string) => {
            if (tool === 'navigate') return page('https://example.com/', '[1] input (text) "Email"');
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('type', { id: 1, text: 'YOUR_EMAIL' }),
            call('done', { success: false, result: 'Needs a sign-in.' }),
            text('COMPLETE\n\nI need you to sign in first.'),
        ]);
        const { agent } = makeAgent(llm);
        await agent.run();

        expect(mockSession.run).not.toHaveBeenCalledWith('type', expect.anything());
        const toolResult = llm.requests[1].messages.find((m: any) => m.role === 'tool');
        expect(toolResult.content).toContain('is a placeholder, not a real value');
    });

    test('pauses on a sign-in wall until the user replies, then starts fresh', async () => {
        let signedIn = false;
        mockSession.run.mockImplementation(async (tool: string) => {
            if (tool === 'navigate') return page('https://example.com/login', '[1] input (password) "Password"', { blocker: { kind: 'login', wall: true, score: 6 } });
            if (tool === 'state') return page('https://example.com/home', '[T1] Your orders', { outcome: 'Looked at the page', tookOver: signedIn });
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('done', { success: true, result: 'You have no orders.' }),
            text('COMPLETE\n\nYou have no orders.'),
        ]);
        const { agent, updates } = makeAgent(llm);
        const running = agent.run();

        await waitFor(() => agent.isWaitingForUser);
        expect(updates.at(-1)).toMatchObject({ status: 'needs-help' });
        expect(updates.at(-1).question).toContain('browser_use.blockers.login');
        expect(llm.completeWithTools).not.toHaveBeenCalled();

        signedIn = true;
        expect(agent.reply('')).toBe(true);
        const result = await running;

        expect(result).toContain('You have no orders.');
        expect(mockSession.handBack).toHaveBeenCalled();
        // After the reset the model gets the page as it is now, with a note of what happened.
        const intro = llm.requests[0].messages[1].content;
        expect(intro).toContain('Then the user signed in');
        expect(intro).toContain('Your orders');
        expect(llm.requests[0].messages.some((m: any) => m.role === 'tool')).toBe(false);
    });

    test('stop ends the session while a model call is in flight', async () => {
        mockSession.run.mockImplementation(async () => page('https://example.com/', '[T1] Hello'));
        let release: () => void = () => { };
        const llm = scriptedLLM([() => new Promise((resolve) => { release = () => resolve(call('scroll', { direction: 'down' })); })]);
        const { agent, updates } = makeAgent(llm);
        const running = agent.run();

        await waitFor(() => llm.completeWithTools.mock.calls.length > 0);
        agent.stop('user');
        const result = await running;
        release();

        expect(result).toContain('The user stopped the browser session');
        expect(updates.at(-1)).toMatchObject({ status: 'stopped' });
        expect(mockSession.close).toHaveBeenCalled();
    });

    test('refuses addresses with ids it never saw', async () => {
        mockSession.run.mockImplementation(async (tool: string) => {
            if (tool === 'navigate') return page('https://shop.example.com/', '[1] a "Widgets" -> /c/widgets');
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('navigate', { url: 'https://shop.example.com/product/8812345' }),
            call('done', { success: false, result: 'Could not find it.' }),
            text('COMPLETE\n\nI could not find it.'),
        ]);
        const { agent } = makeAgent(llm, { startUrl: 'https://shop.example.com' });
        await agent.run();

        expect(mockSession.run).toHaveBeenCalledTimes(1);
        const toolResult = llm.requests[1].messages.find((m: any) => m.role === 'tool');
        expect(toolResult.content).toContain('probably made up');
    });
});

describe('BrowserAgent continuing a session', () => {
    const earlier = {
        id: '11111111-1111-4111-8111-111111111111',
        task: 'Add the blue widget to my cart on shop.example.com',
        profile: 'Work',
        profileId: 'work',
        status: 'done' as const,
        summary: 'Added the blue widget ($19.99) to the cart.',
        notes: ['Blue widget is item 8812345'],
        workspace: null,
        model: null,
        tokens: { prompt: 0, completion: 0, total: 0 },
        startedAt: '2026-10-03T10:00:00.000Z',
        endedAt: '2026-10-03T10:01:00.000Z',
        steps: [
            { at: '', action: 'navigate', label: 'Opening shop.example.com', ok: true, url: 'https://shop.example.com/', title: 'Shop', favicon: null, thumbnail: null, sent: null },
            { at: '', action: 'click', label: 'Clicking Add to cart', ok: true, url: 'https://shop.example.com/product/8812345', title: 'Blue widget', favicon: null, thumbnail: null, sent: null },
        ],
    };

    test('reopens the earlier profile on the page it ended on, knowing what the earlier task did', async () => {
        const { default: BrowserSession } = jest.requireMock('../session');
        BrowserSession.create.mockClear();
        mockSession.close.mockClear();
        mockSession.run.mockImplementation(async (tool: string) => {
            if (tool === 'navigate') return page('https://shop.example.com/product/8812345', '[1] button "Remove"\n[T1] Blue widget\n[T2] In your cart');
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('done', { success: true, result: 'It is in the cart.' }),
            text('COMPLETE\n\nThe blue widget is in your cart.'),
        ]);
        const { agent, updates } = makeAgent(llm, { task: 'Is it still in my cart?', startUrl: null, resume: { from: earlier } });

        await agent.run();

        expect(BrowserSession.create).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'work', profile: 'Work' }));
        expect(mockSession.run).toHaveBeenCalledWith('navigate', { url: 'https://shop.example.com/product/8812345' });
        const intro = llm.requests[0].messages[1].content;
        expect(intro).toContain('the browser was reopened on the page it ended on');
        expect(intro).toContain('Add the blue widget to my cart');
        expect(intro).toContain('Added the blue widget ($19.99) to the cart.');
        expect(intro).toContain('Blue widget is item 8812345');
        expect(intro).toContain('In your cart');
        expect(updates.find((u) => u.step)?.step.label).toBe('browser_use.steps.resuming');
        expect(updates.at(-1)).toMatchObject({ continuedFrom: earlier.id });
        // No WebView outlives its session.
        expect(mockSession.close).toHaveBeenCalled();
    });

    test('starts where the user left the browser after the last task, and says so', async () => {
        mockSession.run.mockImplementation(async (tool: string, args: any) => {
            if (tool === 'navigate') return page(args.url, '[1] button "Place your order"\n[T1] Checkout');
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('done', { success: true, result: 'On checkout.' }),
            text('COMPLETE\n\nYou are on the checkout page.'),
        ]);
        const userPage = { url: 'https://shop.example.com/checkout', title: 'Checkout', at: '2026-10-03T10:05:00.000Z' };
        const { agent } = makeAgent(llm, { task: 'Use my work address', startUrl: null, resume: { from: { ...earlier, userPage } } });

        await agent.run();

        expect(mockSession.run).toHaveBeenNthCalledWith(1, 'navigate', { url: 'https://shop.example.com/checkout' });
        const intro = llm.requests[0].messages[1].content;
        expect(intro).toContain('reopened where the user left it after the last task: "Checkout" (https://shop.example.com/checkout)');
    });

    test('a start URL wins over the earlier last page, and earlier pages are not "made up"', async () => {
        mockSession.run.mockImplementation(async (tool: string, args: any) => {
            if (tool === 'navigate') return page(args.url, '[T1] Cart');
            throw new Error(`unexpected ${tool}`);
        });
        const llm = scriptedLLM([
            call('navigate', { url: 'https://shop.example.com/product/8812345' }),
            call('done', { success: true, result: 'Back on the product.' }),
            text('COMPLETE\n\nBack on the product.'),
        ]);
        const { agent } = makeAgent(llm, { task: 'Open my cart, then the widget again', startUrl: 'https://shop.example.com/cart', resume: { from: earlier } });

        await agent.run();

        expect(mockSession.run).toHaveBeenNthCalledWith(1, 'navigate', { url: 'https://shop.example.com/cart' });
        expect(mockSession.run).toHaveBeenNthCalledWith(2, 'navigate', { url: 'https://shop.example.com/product/8812345' });
    });
});

describe('BrowserAgent in the background', () => {
    const listeners = new Set<(state: string) => void>();
    const setAppState = (state: string) => {
        Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });
        for (const listener of [...listeners]) listener(state);
    };

    beforeEach(() => {
        listeners.clear();
        setAppState('active');
        jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
            listeners.add(listener);
            return { remove: () => listeners.delete(listener) };
        }) as any);
    });

    afterEach(() => jest.restoreAllMocks());

    test('a model call that died while the app was frozen is retried once the user is back', async () => {
        mockSession.run.mockImplementation(async () => page('https://example.com/', '[T1] Blue widget $19.99'));
        const llm = scriptedLLM([
            () => {
                setAppState('background');
                return Promise.reject(new Error('Network request failed'));
            },
            call('done', { success: true, result: 'It costs $19.99.' }),
            text('COMPLETE\n\nThe blue widget costs $19.99.'),
        ]);
        const { agent } = makeAgent(llm);
        const running = agent.run();

        await waitFor(() => llm.completeWithTools.mock.calls.length === 1 && listeners.size > 0);
        await new Promise((resolve) => setTimeout(resolve, 20));
        // Still in the background - nothing is retried yet.
        expect(llm.completeWithTools).toHaveBeenCalledTimes(1);

        setAppState('active');
        const result = await running;

        expect(result).toContain('The blue widget costs $19.99.');
        expect(llm.completeWithTools).toHaveBeenCalledTimes(3);
    });

    test('a failure with the app in front is not retried', async () => {
        mockSession.run.mockImplementation(async () => page('https://example.com/', '[T1] Hello'));
        const llm = scriptedLLM([() => Promise.reject(new Error('401 Unauthorized'))]);
        const { agent, updates } = makeAgent(llm);

        const result = await agent.run();

        expect(llm.completeWithTools).toHaveBeenCalledTimes(1);
        expect(result).toContain('The browser session failed: 401 Unauthorized');
        expect(updates.at(-1)).toMatchObject({ status: 'failed' });
    });
});

describe('helpers', () => {
    test('parseJsonAction reads a plain-text tool call', () => {
        expect(parseJsonAction('Sure! ```json\n{"tool": "click", "args": {"id": 3}}\n```')).toEqual({ name: 'click', args: { id: 3 } });
        expect(parseJsonAction('{"name":"navigate","arguments":"{\\"url\\":\\"x.com\\"}"}')).toEqual({ name: 'navigate', args: { url: 'x.com' } });
        expect(parseJsonAction('no json here')).toBeNull();
    });

    test('taskTerms drops stopwords and stems long words', () => {
        expect(taskTerms('Find refurbished laptops at Micro Center')).toEqual(['refurb', 'laptops', 'micro', 'center']);
    });
});

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
    const started = Date.now();
    while (!condition()) {
        if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
