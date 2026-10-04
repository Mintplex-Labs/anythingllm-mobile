jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@/store/UIStore', () => ({ __esModule: true, default: { getFromStorage: jest.fn(async (_key: string, fallback: any) => fallback) } }));
jest.mock('@/utils/BackgroundWork', () => ({ __esModule: true, default: { begin: jest.fn(async () => true), update: jest.fn(), end: jest.fn(async () => { }) } }));
jest.mock('@/utils/BrowserUse/native', () => ({ hasNativeBrowser: true }));

jest.mock('@/utils/BrowserUse', () => ({
    __esModule: true,
    default: {
        getCapabilities: jest.fn(async () => ({ available: true })),
        isLive: jest.fn(() => false),
        register: jest.fn(),
        unregister: jest.fn(),
    },
}));
jest.mock('@/utils/BrowserUse/traces', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/utils/BrowserUse/agent', () => {
    const agents: any[] = [];
    return {
        __esModule: true,
        agents,
        default: class {
            id = `agent-${agents.length + 1}`;
            options: any;
            constructor(options: any) {
                this.options = options;
                agents.push(this);
            }
            stop() { }
            snapshot = { recentSteps: [{ url: 'https://shop.example.com/cart' }] };
            async run() {
                return 'The browser task is complete.';
            }
        },
    };
});

import browserUse from '../index';

const mockHub = jest.requireMock('@/utils/BrowserUse').default;
const mockTraces = jest.requireMock('@/utils/BrowserUse/traces').default;
const mockAgents: any[] = jest.requireMock('@/utils/BrowserUse/agent').agents;

const llm = { completeWithTools: jest.fn() };
const sessionAction = (sessionId: string) => ({ type: 'browser_use_session', action: { sessionId } });

beforeEach(() => {
    mockAgents.length = 0;
    jest.clearAllMocks();
    mockHub.isLive.mockReturnValue(false);
});

describe('browser_use continue_session', () => {
    test('continues the newest session saved with the chat, from its trace', async () => {
        const trace = { id: 'session-2', steps: [] };
        mockTraces.get.mockResolvedValue(trace);
        const history = [
            { response: { actions: [sessionAction('session-1')] } },
            { response: { actions: [sessionAction('session-2')] } },
            { response: null },
        ];

        const result = await browserUse.execute({ task: 'Now remove it from my cart', continue_session: true }, jest.fn(), { llm, history: history as any });

        expect(mockTraces.get).toHaveBeenCalledWith('session-2');
        expect(mockAgents[0].options.resume).toEqual({ from: trace });
        expect(result).toContain('continue_session=true');
    });

    test('a second call in the same reply continues the session the first one started', async () => {
        mockTraces.get.mockResolvedValue({ id: 'agent-1', steps: [] });
        const history = [{ response: { actions: [sessionAction('older')] } }];

        await browserUse.execute({ task: 'Add it to my cart' }, jest.fn(), { llm, history: history as any });
        await browserUse.execute({ task: 'Now check out', continue_session: true }, jest.fn(), { llm, history: history as any });

        expect(mockAgents[0].options.resume).toBeNull();
        expect(mockTraces.get).toHaveBeenCalledWith('agent-1');
        expect(mockAgents[1].options.resume).toEqual({ from: { id: 'agent-1', steps: [] } });
    });

    test('starts fresh and says so when there is nothing to continue', async () => {
        const result = await browserUse.execute({ task: 'Remove it', continue_session: true }, jest.fn(), { llm, history: [] });

        expect(mockAgents[0].options.resume).toBeNull();
        expect(result).toContain('no earlier browser session in this chat');
    });

    test('will not continue a session that is still running', async () => {
        mockHub.isLive.mockReturnValue(true);
        const history = [{ response: { actions: [sessionAction('running')] } }];

        const result = await browserUse.execute({ task: 'Remove it', continue_session: true }, jest.fn(), { llm, history: history as any });

        expect(mockAgents).toHaveLength(0);
        expect(result).toContain('still running');
    });
});
