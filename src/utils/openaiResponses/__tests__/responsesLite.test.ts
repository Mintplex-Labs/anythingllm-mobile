const mockGetAccessToken = jest.fn();
const mockStreamingFetch = jest.fn();
// Test responses carry their SSE `data:` payloads as an array of objects in `body`.
const mockReadSSEDataLines = async function* (body: any[]) {
  for (const event of body) yield JSON.stringify(event);
};

jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string, vars?: any) => (vars?.url ? `${key} ${vars.url}` : key) } }));
jest.mock('@/utils/device', () => ({
  safeParseJSON: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
}));
jest.mock('@/utils/streamingFetch', () => ({
  getStreamingFetch: () => mockStreamingFetch,
  readSSEDataLines: (body: any[]) => mockReadSSEDataLines(body),
}));
import ResponsesLite from '../index';

const streamResponse = (events: any[], status = 200, errorBody: any = null) => ({
  ok: status < 400,
  status,
  body: events,
  text: async () => (errorBody ? JSON.stringify(errorBody) : ''),
});
/** The client the ChatGPT provider builds - plan usage with a refreshable OAuth token. */
const planClient = () => new ResponsesLite({ planUsage: true, getAccessToken: (options) => mockGetAccessToken(options) });
const completed = { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } };

async function collect(iterable: AsyncIterable<any>) {
  const chunks: any[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

beforeEach(() => {
  mockGetAccessToken.mockReset().mockResolvedValue('token-1');
  mockStreamingFetch.mockReset();
});

describe('ResponsesLite.toResponsesInput', () => {
  test('system -> instructions, tool round trip -> function_call items, images -> input_image', () => {
    const { instructions, input } = ResponsesLite.toResponsesInput([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }] },
      { role: 'assistant', content: 'Let me check.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"x"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'result text', signature: 'web_search(q=x)', function: 'web_search' },
    ]);

    expect(instructions).toBe('Be brief.');
    expect(input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'What is this?' }, { type: 'input_image', image_url: 'data:image/png;base64,AAA' }] },
      { role: 'assistant', content: 'Let me check.' },
      { type: 'function_call', call_id: 'call_1', name: 'web_search', arguments: '{"q":"x"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'result text' },
    ]);
  });

  test('a tool result without a matching call becomes plain user text', () => {
    const { input } = ResponsesLite.toResponsesInput([
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: 'missing', content: '42', signature: 'calc()' },
    ]);
    expect(input[1]).toEqual({ role: 'user', content: 'Function: calc()\nResult: 42' });
  });
});

describe('ResponsesLite streaming (ChatGPT plan usage)', () => {
  test('sends a plan-usage compatible body and translates events to chat chunks', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([
      { type: 'response.created' },
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_9', name: 'get_time', arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"tz":' },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '"UTC"}' },
      { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } },
    ]));

    const client = planClient();
    const chunks = await collect(client.streamChatCompletion({
      model: 'gpt-x',
      stream: true,
      temperature: 0.7,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'get_time', description: 'time', parameters: { type: 'object', properties: {} } } }],
    }));

    const [url, init] = mockStreamingFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      model: 'gpt-x',
      instructions: 'sys',
      input: [{ role: 'user', content: 'hi' }],
      store: false,
      stream: true,
      tools: [{ type: 'function', name: 'get_time', description: 'time', parameters: { type: 'object', properties: {} }, strict: false }],
      tool_choice: 'auto',
    });

    const text = chunks.map(c => c.choices[0].delta.content ?? '').join('');
    expect(text).toBe('Hello');
    const toolDeltas = chunks.flatMap(c => c.choices[0].delta.tool_calls ?? []);
    expect(toolDeltas[0]).toMatchObject({ index: 0, id: 'call_9', function: { name: 'get_time' } });
    expect(toolDeltas.map(d => d.function.arguments).join('')).toBe('{"tz":"UTC"}');
    const last = chunks[chunks.length - 1];
    expect(last.choices[0].finish_reason).toBe('tool_calls');
    expect(last.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  test('plan usage limit errors are mapped to a readable message', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([
      { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'raw' } } },
    ]));
    const client = planClient();
    await expect(collect(client.streamChatCompletion({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] })))
      .rejects.toThrow('providers.chatgpt.errors.usage_limit https://chatgpt.com/settings/usage');
  });

  test('a stream that ends without response.completed is an error', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([{ type: 'response.output_text.delta', delta: 'partial' }]));
    const client = planClient();
    await expect(collect(client.streamChatCompletion({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] })))
      .rejects.toThrow('providers.errors.stream_interrupted');
  });

  test('a 401 refreshes the token and retries once', async () => {
    mockGetAccessToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');
    mockStreamingFetch
      .mockResolvedValueOnce(streamResponse([], 401))
      .mockResolvedValueOnce(streamResponse([{ type: 'response.completed', response: { usage: {} } }]));

    const client = planClient();
    await collect(client.streamChatCompletion({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }));

    expect(mockGetAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(mockStreamingFetch).toHaveBeenCalledTimes(2);
    expect(mockStreamingFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  test('non-streaming completions are collected from the stream', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([
      { type: 'response.output_text.delta', delta: 'Done.' },
      { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 2 } } },
    ]));
    const client = planClient();
    const result = await client.createChatCompletion({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.choices[0].message.content).toBe('Done.');
    expect(result.choices[0].finish_reason).toBe('stop');
  });
});

describe('ResponsesLite.listModels', () => {
  test('maps plan models to the OpenAI list shape, keeping only listed ones', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { slug: 'gpt-a', display_name: 'GPT A', visibility: 'list' },
          { slug: 'gpt-hidden', display_name: 'Hidden', visibility: 'hide' },
        ],
      }),
    }) as any;
    try {
      const client = planClient();
      const models = await client.listModels();
      expect(models.data).toEqual([{ id: 'gpt-a', object: 'model', owned_by: 'openai', name: 'GPT A' }]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('ResponsesLite with an API key (OpenAI provider)', () => {
  const keyClient = () => new ResponsesLite({ apiKey: 'sk-test' });
  const body = (model: string) => ({ model, stream: true, temperature: 0.3, messages: [{ role: 'user', content: 'hi' }] });

  test('authenticates with the key, sends temperature, and never retries a 401', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([completed]));
    await collect(keyClient().streamChatCompletion(body('gpt-key-a')));
    const [, init] = mockStreamingFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-key-a', temperature: 0.3, store: false, stream: true });

    mockStreamingFetch.mockReset().mockResolvedValue(streamResponse([], 401, { error: { message: 'Incorrect API key provided' } }));
    await expect(collect(keyClient().streamChatCompletion(body('gpt-key-a')))).rejects.toThrow('Request failed with status 401: Incorrect API key provided');
    expect(mockStreamingFetch).toHaveBeenCalledTimes(1);
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  test('a model that rejects temperature is retried without it, and remembered', async () => {
    mockStreamingFetch
      .mockResolvedValueOnce(streamResponse([], 400, {
        error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", type: 'invalid_request_error', param: 'temperature', code: 'unsupported_parameter' },
      }))
      .mockResolvedValue(streamResponse([completed]));

    await collect(keyClient().streamChatCompletion(body('gpt-reasoning-x')));
    expect(mockStreamingFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockStreamingFetch.mock.calls[1][1].body).temperature).toBeUndefined();

    // The next request to the same model leaves it out from the start.
    await collect(keyClient().streamChatCompletion(body('gpt-reasoning-x')));
    expect(mockStreamingFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(mockStreamingFetch.mock.calls[2][1].body).temperature).toBeUndefined();
  });

  test('other 400s are surfaced with the API message', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([], 400, { error: { message: 'Invalid schema for function', param: 'tools' } }));
    await expect(collect(keyClient().streamChatCompletion(body('gpt-key-b')))).rejects.toThrow('Request failed with status 400: Invalid schema for function');
    expect(mockStreamingFetch).toHaveBeenCalledTimes(1);
  });

  test('plan usage never sends temperature', async () => {
    mockStreamingFetch.mockResolvedValue(streamResponse([completed]));
    await collect(planClient().streamChatCompletion(body('gpt-plan')));
    expect(JSON.parse(mockStreamingFetch.mock.calls[0][1].body).temperature).toBeUndefined();
  });

  test('lists models from the standard { data } shape', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ object: 'list', data: [{ id: 'gpt-6-astra', object: 'model', owned_by: 'openai' }] }) }) as any;
    try {
      const models = await keyClient().listModels();
      expect(models.data.map((m: any) => m.id)).toEqual(['gpt-6-astra']);
      expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
