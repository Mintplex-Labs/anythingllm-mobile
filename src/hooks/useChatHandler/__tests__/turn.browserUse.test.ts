jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@/utils/constants', () => ({ generateUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }));

import AssistantTurn from '../turn';

const snapshot = (overrides: Record<string, any> = {}) => ({
    sessionId: 's1',
    task: 'Check my feed',
    profile: 'Default',
    status: 'running',
    summary: null,
    question: null,
    tokens: { prompt: 0, completion: 0, total: 0, estimated: false },
    stepCount: 1,
    step: null,
    recentSteps: [],
    sites: [],
    startedAt: '2026-10-02T10:00:00.000Z',
    endedAt: null,
    ...overrides,
});

describe('report_browser_session', () => {
    test('keeps one card per session, updated in place', () => {
        const turn = new AssistantTurn({ uuid: 'chat-1', prompt: 'hi' } as any);

        expect(turn.applyEvent('report_browser_session', snapshot())).toEqual({ changed: true, immediate: true });
        // Step and token updates ride the throttle...
        expect(turn.applyEvent('report_browser_session', snapshot({ stepCount: 2 }))).toEqual({ changed: true, immediate: false });
        // ...a status change shows right away.
        expect(turn.applyEvent('report_browser_session', snapshot({ status: 'needs-help', question: 'Sign in?' }))).toEqual({ changed: true, immediate: true });
        turn.applyEvent('report_browser_session', snapshot({ sessionId: 's2' }));

        const actions = turn.response.actions;
        expect(actions).toHaveLength(2);
        expect(actions[0]).toMatchObject({ type: 'browser_use_session', action: { sessionId: 's1', status: 'needs-help', stepCount: 1, question: 'Sign in?' } });
        expect(actions[1]).toMatchObject({ type: 'browser_use_session', action: { sessionId: 's2' } });
    });

    test('ignores malformed updates', () => {
        const turn = new AssistantTurn({ uuid: 'chat-1', prompt: 'hi' } as any);
        expect(turn.applyEvent('report_browser_session', {} as any)).toEqual({ changed: false, immediate: false });
        expect(turn.response.actions).toHaveLength(0);
    });
});
