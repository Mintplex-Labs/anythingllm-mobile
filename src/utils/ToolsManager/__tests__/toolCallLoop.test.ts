jest.mock('@/store/UIStore', () => ({ __esModule: true, default: { getFromStorage: jest.fn() } }));
jest.mock('@/utils/Telemetry', () => ({ __esModule: true, default: { logEvent: jest.fn(), CUSTOM_EVENTS: { ACTIONS: {} } } }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../tools', () => ({ __esModule: true, default: { default: {}, createFiles: {}, appConnections: {}, calendar: {} } }));
jest.mock('../toolReranker', () => ({ __esModule: true, default: class {} }));
jest.mock('../../chat/contextCompaction', () => ({ truncateMiddle: (text: string) => text }));
jest.mock('../../constants', () => ({ generateUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }));

import ToolsManager, { type ToolManagerTool } from '@/utils/ToolsManager';

function makeTool(name: string): ToolManagerTool {
  return {
    id: name,
    name,
    description: name,
    defaultEnabled: true,
    category: 'default',
    definition: { type: 'function', function: { name, parameters: { type: 'object', properties: {}, required: [] } } },
    config: {},
    execute: jest.fn(async () => `${name} result`),
  };
}

let callId = 0;
function toolCallResponse(names: string[]) {
  return {
    textResponse: '',
    toolCalls: names.map((name) => ({ id: `call_${++callId}`, type: 'function', function: { name, arguments: '{}' } })),
  } as any;
}

describe('toolCallLoop max tool calls', () => {
  const history = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'do the thing' }];

  test('model that never stops calling tools is capped, then answers with no tools', async () => {
    const search = makeTool('search');
    const rounds: { messages: any[]; tools: any[] }[] = [];
    const runStreamCompletion = jest.fn(async (messages: any[], _cb: any, tools: any[]) => {
      rounds.push({ messages, tools });
      if (tools.length === 0) return { textResponse: 'final answer' } as any;
      return toolCallResponse(['search']);
    });
    const events: [string, any][] = [];

    const result = await ToolsManager.toolCallLoop({
      currentResponse: toolCallResponse(['search']),
      runStreamCompletion,
      streamEmitter: (event, data) => events.push([event, data]),
      currentMessageHistory: history,
      mergeToolCallResults: false,
      toolset: [search],
      maxToolCalls: 3,
    });

    expect(result.textResponse).toBe('final answer');
    expect(search.execute).toHaveBeenCalledTimes(3);
    // 2 tool rounds after the first response, then the tools-off round
    expect(rounds).toHaveLength(3);
    const finalRound = rounds[rounds.length - 1];
    expect(finalRound.tools).toEqual([]);
    // No tool protocol messages left - results are folded into the last user message
    expect(finalRound.messages.some((m) => m.role === 'tool' || m.tool_calls)).toBe(false);
    const lastUser = finalRound.messages[finalRound.messages.length - 1];
    expect(lastUser.role).toBe('user');
    expect(lastUser.content).toContain('do the thing');
    expect(lastUser.content.match(/search result/g)).toHaveLength(3);
    expect(lastUser.content).toContain('tool call limit');
    expect(events).toContainEqual(['report_status', 'models.status.tool_call_limit_reached']);
  });

  test('parallel tool calls are cut down to the first one', async () => {
    const search = makeTool('search');
    const time = makeTool('time');
    const sent: any[][] = [];
    const runStreamCompletion = jest.fn(async (messages: any[]) => {
      sent.push(messages);
      return { textResponse: 'done' } as any;
    });
    const events: [string, any][] = [];

    await ToolsManager.toolCallLoop({
      currentResponse: toolCallResponse(['search', 'time', 'search']),
      runStreamCompletion,
      streamEmitter: (event, data) => events.push([event, data]),
      currentMessageHistory: history,
      mergeToolCallResults: false,
      toolset: [search, time],
      maxToolCalls: 10,
    });

    expect(search.execute).toHaveBeenCalledTimes(1);
    expect(time.execute).not.toHaveBeenCalled();
    expect(events.filter(([event]) => event === 'report_tool_call')).toHaveLength(1);
    // The echoed assistant message only carries the call that ran, paired with its one result
    const assistant = sent[0].find((m: any) => m.role === 'assistant');
    expect(assistant.tool_calls).toHaveLength(1);
    const results = sent[0].filter((m: any) => m.role === 'tool');
    expect(results).toHaveLength(1);
    expect(results[0].tool_call_id).toBe(assistant.tool_calls[0].id);
  });

  test('under the limit the loop behaves as before', async () => {
    const search = makeTool('search');
    const runStreamCompletion = jest.fn(async (_messages: any[], _cb: any, tools: any[]) => {
      expect(tools).toHaveLength(1);
      return { textResponse: 'done' } as any;
    });

    const result = await ToolsManager.toolCallLoop({
      currentResponse: toolCallResponse(['search']),
      runStreamCompletion,
      streamEmitter: () => {},
      currentMessageHistory: history,
      mergeToolCallResults: false,
      toolset: [search],
      maxToolCalls: 10,
    });

    expect(result.textResponse).toBe('done');
    expect(search.execute).toHaveBeenCalledTimes(1);
    const sent = runStreamCompletion.mock.calls[0][0];
    expect(sent.some((m: any) => m.role === 'tool' && m.tool_call_id)).toBe(true);
  });

  test('no cap keeps looping until the model stops', async () => {
    const search = makeTool('search');
    let round = 0;
    const runStreamCompletion = jest.fn(async () => (++round < 15 ? toolCallResponse(['search']) : ({ textResponse: 'done' } as any)));

    const result = await ToolsManager.toolCallLoop({
      currentResponse: toolCallResponse(['search']),
      runStreamCompletion,
      streamEmitter: () => {},
      currentMessageHistory: history,
      mergeToolCallResults: false,
      toolset: [search],
      maxToolCalls: null,
    });

    expect(result.textResponse).toBe('done');
    expect(search.execute).toHaveBeenCalledTimes(15);
  });
});
