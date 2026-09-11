import { getStreamingFetch, readSSEDataLines } from '@/utils/streamingFetch';
import { safeParseJSON } from '../device';
import type { IRequestOptions } from '@/utils/openai';

/**
 * A tiny REST client for the Anthropic Messages API that exposes the same surface as `OpenAILite`
 * (`chat.completions.create`, `models.list`) and speaks OpenAI shapes on both sides:
 *  - request bodies are OpenAI chat-completion bodies (`messages`, `tools`, `temperature`, `stream`)
 *    and are translated to the Messages API (`system`, content blocks, `input_schema` tools, `max_tokens`)
 *  - responses and stream events are translated back to OpenAI chat-completion (chunk) objects so
 *    `BaseOpenAILikeProvider` can consume them untouched (`choices[0].delta.content`, `tool_calls`, `usage`).
 *
 * We cannot ship `@anthropic-ai/sdk` in React Native (its Node polyfills break the bundle) so everything
 * is done with `fetch`. Also used for Anthropic models served by AWS Bedrock, which exposes the same API
 * under `/anthropic` on the Bedrock Mantle/runtime hosts with bearer auth.
 */

export type IAnthropicLiteOptions = {
  apiKey?: string | null;
  baseURL?: string;
  /**
   * How the API key is sent. Anthropic's own API uses `x-api-key`; AWS Bedrock's Anthropic
   * compatible route authenticates with a `Bearer` API key instead.
   */
  authMode?: 'x-api-key' | 'bearer';
  defaultHeaders?: Record<string, string>;
  /** Fallback for `max_tokens` when the model's limit cannot be fetched from `/models/{id}`. */
  defaultMaxTokens?: number;
  /** Look up `max_tokens` from `/models/{id}` once per model. Off for hosts without that route (Bedrock). */
  fetchMaxTokens?: boolean;
};

type OpenAIToolDefinition = {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, any> };
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicContentBlock[] };

/**
 * What the model produced in one round of the current chat turn. The tool loop in
 * `BaseOpenAILikeProvider`/`ToolsManager` only appends `{ role: 'tool', ... }` results to the
 * history - never the assistant reply or its `tool_use` block - so we remember each round here and
 * splice it back in on the next request. Without it Claude sees a result for a call it never made,
 * and asks for the same tool again forever.
 */
type RecordedAssistantRound = {
  text: string;
  toolUses: { id: string; name: string; input: any }[];
};

export const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Models that reject the `temperature` parameter with a 400. Mirrors `noTemperatureModels`
 * in the desktop server (utils/AiProviders/anthropic). Matched with `includes` so Bedrock ids
 * (`anthropic.claude-sonnet-5`, `eu.anthropic.claude-opus-4-8-...`) are covered too.
 */
export const ANTHROPIC_NO_TEMPERATURE_MODELS = [
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-5',
];

export default class AnthropicLite {
  private baseURL: string = 'https://api.anthropic.com/v1';
  private apiKey: string | null = null;
  private authMode: 'x-api-key' | 'bearer' = 'x-api-key';
  private defaultHeaders: Record<string, string> = {};
  private defaultMaxTokens: number = 4096;
  private fetchMaxTokens: boolean = true;
  private maxTokensCache: Record<string, number> = {};
  /** Assistant rounds of the chat turn in progress, oldest first - see `RecordedAssistantRound`. */
  private assistantRounds: RecordedAssistantRound[] = [];
  private streamingFetch: typeof fetch;

  public models = {
    list: () => this.listModels(),
    retrieve: (model: string) => this.retrieveModel(model),
  };

  public chat = {
    completions: {
      create: (body: any, options?: IRequestOptions) => {
        if (body.stream) return this.streamChatCompletion(body, options);
        return this.createChatCompletion(body, options);
      },
    },
  };

  constructor({ apiKey, baseURL, authMode, defaultHeaders, defaultMaxTokens, fetchMaxTokens }: IAnthropicLiteOptions = {}) {
    this.apiKey = apiKey || this.apiKey;
    this.baseURL = (baseURL || this.baseURL).replace(/\/+$/, '');
    this.authMode = authMode || this.authMode;
    this.defaultHeaders = defaultHeaders || {};
    this.defaultMaxTokens = defaultMaxTokens || this.defaultMaxTokens;
    if (fetchMaxTokens === false) this.fetchMaxTokens = false;
    this.streamingFetch = getStreamingFetch();
  }

  private log = (text: string, ...args: any[]) => {
    console.log(`🛠️ \x1b[33m[AnthropicLite]\x1b[0m ${text}`, ...args);
  };

  private baseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      // Bedrock's Anthropic route accepts the API key either as a bearer token or as `x-api-key`
      // (the desktop's SDK sends the latter) - send both there so either gateway variant is happy.
      ...(this.apiKey
        ? this.authMode === 'bearer'
          ? { Authorization: `Bearer ${this.apiKey}`, 'x-api-key': this.apiKey }
          : { 'x-api-key': this.apiKey }
        : {}),
      ...this.defaultHeaders,
    };
  }

  private signalFromOptions(options: IRequestOptions = {}): AbortSignal | undefined {
    return options.signal ?? options.controller?.signal ?? undefined;
  }

  private static supportsTemperature(model: string) {
    return !ANTHROPIC_NO_TEMPERATURE_MODELS.some((m) => model.includes(m));
  }

  // ---------------------------------------------------------------------------
  // OpenAI -> Anthropic request translation
  // ---------------------------------------------------------------------------

  private static parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;
    return { mediaType: matches[1], data: matches[2] };
  }

  /**
   * Turns an OpenAI message `content` (string or content-part array) into Anthropic content blocks.
   * Empty text blocks are dropped - Anthropic rejects them.
   */
  private static toContentBlocks(content: any): AnthropicContentBlock[] {
    if (content === null || content === undefined) return [];
    if (typeof content === 'string') {
      return content.trim().length > 0 ? [{ type: 'text', text: content }] : [];
    }
    if (!Array.isArray(content)) return [{ type: 'text', text: String(content) }];

    const blocks: AnthropicContentBlock[] = [];
    for (const part of content) {
      if (!part) continue;
      if (part.type === 'text') {
        if (part.text && part.text.trim().length > 0) blocks.push({ type: 'text', text: part.text });
      } else if (part.type === 'image_url') {
        const parsed = AnthropicLite.parseDataUrl(part.image_url?.url);
        if (parsed) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } });
        }
      } else if (part.type === 'image' || part.type === 'tool_use' || part.type === 'tool_result') {
        blocks.push(part); // already an Anthropic block
      }
    }
    return blocks;
  }

  /**
   * Converts OpenAI chat messages to the `system` string + alternating user/assistant messages the
   * Messages API requires.
   *  - `system` messages are concatenated into the top level `system` field.
   *  - a run of `tool` messages (what ToolsManager appends after executing a round's tool calls) is
   *    preceded by the assistant round we recorded for it (reply text + `tool_use` blocks) and rendered
   *    as `tool_result` blocks paired to those ids. `tool` messages that already carry a `tool_call_id`
   *    become `tool_result` blocks directly; if we have no recorded round the result falls back to text.
   *  - assistant messages with OpenAI `tool_calls` become `tool_use` blocks.
   *  - consecutive same-role messages are merged and the conversation is forced to start with a user turn.
   */
  private prepareMessages(messages: any[] = []): { system: string | undefined; messages: AnthropicMessage[] } {
    const systemParts: string[] = [];
    const prepared: AnthropicMessage[] = [];

    // A request with no tool results is the first round of a new chat turn - forget the previous turn's rounds.
    const hasToolResults = messages.some((m) => m?.role === 'tool' || m?.role === 'function');
    if (!hasToolResults) this.assistantRounds = [];
    let roundIndex = 0;

    const push = (role: 'user' | 'assistant', blocks: AnthropicContentBlock[]) => {
      if (blocks.length === 0) return;
      const last = prepared[prepared.length - 1];
      if (last && last.role === role) last.content.push(...blocks);
      else prepared.push({ role, content: blocks });
    };

    const resultText = (message: any) => {
      const result = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '');
      return result && result.trim().length > 0 ? result : 'Tool executed successfully.';
    };
    const asPlainText = (message: any): AnthropicContentBlock => {
      const label = message.signature || message.function || message.name || 'tool';
      return { type: 'text', text: `Function: ${label}\nResult: ${resultText(message)}` };
    };

    /** Renders a run of consecutive ToolsManager `tool` messages (no `tool_call_id`) for one round. */
    const pushToolRun = (run: any[]) => {
      // The history carries no assistant messages between rounds, so the results of every round of
      // this turn sit in one consecutive run. Walk the recorded rounds in order, each one consuming as
      // many results as it made tool calls, so round 2's call is replayed before round 2's result.
      const remaining = [...run];
      while (remaining.length > 0) {
        const round = this.assistantRounds[roundIndex];
        if (!round || round.toolUses.length === 0) {
          // Nothing recorded for the rest - keep the results visible as plain text.
          push('user', remaining.splice(0).map(asPlainText));
          break;
        }
        roundIndex++;

        const assistantBlocks: AnthropicContentBlock[] = [];
        if (round.text.trim().length > 0) assistantBlocks.push({ type: 'text', text: round.text });
        for (const toolUse of round.toolUses) assistantBlocks.push({ type: 'tool_use', ...toolUse });
        push('assistant', assistantBlocks);

        // Every tool_use must get exactly one tool_result. Take this round's share of the results,
        // pairing by tool name first and then by order.
        const share = remaining.splice(0, round.toolUses.length);
        const results: AnthropicContentBlock[] = round.toolUses.map((toolUse) => {
          const byName = share.findIndex((m) => m.function === toolUse.name || m.name === toolUse.name);
          const message = share.splice(byName !== -1 ? byName : 0, 1)[0];
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: message ? resultText(message) : 'No result was produced for this tool call.',
          };
        });
        push('user', results);
      }
    };

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue;
      switch (message.role) {
        case 'system': {
          const text = typeof message.content === 'string'
            ? message.content
            : AnthropicLite.toContentBlocks(message.content).map((b) => (b.type === 'text' ? b.text : '')).join('\n');
          if (text.trim().length > 0) systemParts.push(text);
          break;
        }
        case 'tool':
        case 'function': {
          if (message.tool_call_id) {
            push('user', [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: resultText(message) }]);
            break;
          }
          // Collect the whole run of results from this round so they pair with one recorded assistant round.
          const run = [message];
          while (
            i + 1 < messages.length &&
            (messages[i + 1]?.role === 'tool' || messages[i + 1]?.role === 'function') &&
            !messages[i + 1]?.tool_call_id
          ) {
            run.push(messages[++i]);
          }
          pushToolRun(run);
          break;
        }
        case 'assistant': {
          const blocks = AnthropicLite.toContentBlocks(message.content);
          for (const call of message.tool_calls ?? []) {
            let input: any = {};
            try {
              input = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : (call.function?.arguments ?? {});
            } catch {
              input = {};
            }
            blocks.push({ type: 'tool_use', id: call.id || `toolu_${Date.now()}`, name: call.function?.name, input });
          }
          push('assistant', blocks);
          break;
        }
        case 'user':
        default:
          push('user', AnthropicLite.toContentBlocks(message.content));
          break;
      }
    }

    // The first message must be from the user.
    while (prepared.length > 0 && prepared[0].role !== 'user') prepared.shift();

    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: prepared,
    };
  }

  /** Remembers what the model produced this round so the next request can replay it - see `RecordedAssistantRound`. */
  private recordAssistantRound(text: string, toolUses: { id: string; name: string; inputJson: string }[]) {
    this.assistantRounds.push({
      text,
      toolUses: toolUses
        .filter((t) => !!t.id && !!t.name)
        .map((t) => {
          let input: any = {};
          try {
            input = JSON.parse(t.inputJson || '{}');
          } catch {
            input = {};
          }
          return { id: t.id, name: t.name, input };
        }),
    });
  }

  private static formatTools(tools: OpenAIToolDefinition[] = []) {
    return tools
      .filter((tool) => tool?.function?.name)
      .map((tool) => {
        const parameters = tool.function.parameters ?? { type: 'object', properties: {} };
        return {
          name: tool.function.name,
          description: tool.function.description ?? '',
          input_schema: {
            type: parameters.type ?? 'object',
            properties: parameters.properties ?? {},
            ...(parameters.required ? { required: parameters.required } : {}),
          },
        };
      });
  }

  private async buildRequestBody(body: any, stream: boolean) {
    const { system, messages } = this.prepareMessages(body.messages);
    const tools = AnthropicLite.formatTools(body.tools);
    const maxTokens = await this.maxTokensFor(body.model);

    return {
      model: body.model,
      max_tokens: maxTokens,
      stream,
      ...(system ? { system } : {}),
      messages,
      ...(typeof body.temperature === 'number' && AnthropicLite.supportsTemperature(body.model)
        ? { temperature: Math.min(Math.max(body.temperature, 0), 1) }
        : {}),
      ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' } } : {}),
    };
  }

  /**
   * `max_tokens` is required by the Messages API. Newer models allow far more than the 4096 that
   * older ones accept, so we ask `/models/{id}` once per model and fall back to the default.
   */
  private async maxTokensFor(model: string): Promise<number> {
    if (!this.fetchMaxTokens) return this.defaultMaxTokens;
    if (this.maxTokensCache[model]) return this.maxTokensCache[model];
    try {
      const details = await this.retrieveModel(model);
      const max = Number(details?.max_tokens);
      this.maxTokensCache[model] = Number.isFinite(max) && max > 0 ? max : this.defaultMaxTokens;
    } catch (error) {
      this.log(`Could not fetch max_tokens for ${model} - using ${this.defaultMaxTokens}`, error);
      this.maxTokensCache[model] = this.defaultMaxTokens;
    }
    return this.maxTokensCache[model];
  }

  // ---------------------------------------------------------------------------
  // Anthropic -> OpenAI response translation
  // ---------------------------------------------------------------------------

  private static toOpenAIFinishReason(stopReason: string | null | undefined) {
    switch (stopReason) {
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      default:
        return stopReason ?? null;
    }
  }

  private static toOpenAIUsage(usage: any = {}) {
    const prompt = Number(usage?.input_tokens ?? 0) + Number(usage?.cache_read_input_tokens ?? 0) + Number(usage?.cache_creation_input_tokens ?? 0);
    const completion = Number(usage?.output_tokens ?? 0);
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  }

  private async throwForResponse(response: Response) {
    const text = await response.text().catch(() => '');
    // Error bodies are often plain text/HTML (eg: a 404 from a gateway) - parse quietly, no log spam.
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const message = parsed?.error?.message || parsed?.message || text.slice(0, 200) || response.statusText;
    throw new Error(`Request failed with status ${response.status}: ${message}`);
  }

  async createChatCompletion(body: any, options: IRequestOptions = {}) {
    const url = `${this.baseURL}/messages`;
    this.log('createChatCompletion', url, { hasApiKey: !!this.apiKey });
    const signal = this.signalFromOptions(options);
    const requestBody = await this.buildRequestBody(body, false);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.baseHeaders(),
      body: JSON.stringify(requestBody),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) await this.throwForResponse(response);
    const data = await response.json();

    const textBlocks = (data.content ?? []).filter((block: any) => block.type === 'text');
    const thinkingBlocks = (data.content ?? []).filter((block: any) => block.type === 'thinking');
    // One tool call per round, matching the streaming path and the provider's tool loop.
    const toolBlocks = (data.content ?? []).filter((block: any) => block.type === 'tool_use').slice(0, 1);
    this.recordAssistantRound(
      textBlocks.map((block: any) => block.text).join(''),
      toolBlocks.map((block: any) => ({ id: block.id, name: block.name, inputJson: JSON.stringify(block.input ?? {}) })),
    );

    return {
      id: data.id,
      object: 'chat.completion',
      model: data.model,
      choices: [
        {
          index: 0,
          finish_reason: AnthropicLite.toOpenAIFinishReason(data.stop_reason),
          message: {
            role: 'assistant',
            content: textBlocks.map((block: any) => block.text).join(''),
            ...(thinkingBlocks.length > 0 ? { reasoning_content: thinkingBlocks.map((block: any) => block.thinking).join('') } : {}),
            tool_calls: toolBlocks.map((block: any) => ({
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
            })),
          },
        },
      ],
      usage: AnthropicLite.toOpenAIUsage(data.usage),
    };
  }

  /**
   * Streams `/messages` and yields OpenAI style chat-completion chunks:
   *  - `text_delta` -> `delta.content`
   *  - `thinking_delta` -> `delta.reasoning_content` (folded into <think> tags by the provider)
   *  - `tool_use` block start + `input_json_delta` -> `delta.tool_calls[0].function.{name,arguments}`
   *  - `message_start`/`message_delta` usage -> `usage`
   *  - `message_delta.stop_reason` -> `choices[0].finish_reason`
   */
  async *streamChatCompletion(body: any, options: IRequestOptions = {}) {
    const url = `${this.baseURL}/messages`;
    this.log('streamChatCompletion', url, { hasApiKey: !!this.apiKey });
    const signal = this.signalFromOptions(options);
    const requestBody = await this.buildRequestBody(body, true);

    const response = await this.streamingFetch(url, {
      method: 'POST',
      headers: this.baseHeaders(),
      body: JSON.stringify(requestBody),
      ...(signal ? { signal } : {}),
      // @ts-ignore
      reactNative: { textStreaming: true },
    });
    if (!response.ok) await this.throwForResponse(response);

    const stream = (response as any).body;
    if (!stream) return;

    const chunkId = `chatcmpl-${Date.now()}`;
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let finishReason: string | null = null;
    // Block index -> tool call index so argument deltas attach to the right call
    const toolCallIndexByBlock: Record<number, number> = {};
    let toolCallCount = 0;
    // What this round produced, recorded at message_stop so the next round's request can replay it.
    let roundText = '';
    const roundToolUses: { id: string; name: string; inputJson: string }[] = [];
    const toolUseByBlock: Record<number, { id: string; name: string; inputJson: string }> = {};

    const chunk = (delta: Record<string, any>, extra: Record<string, any> = {}) => ({
      id: chunkId,
      object: 'chat.completion.chunk',
      model: body.model,
      choices: [{ index: 0, delta, finish_reason: null }],
      ...extra,
    });

    for await (const data of readSSEDataLines(stream)) {
      const event = safeParseJSON(data);
      if (!event || typeof event !== 'object') continue;

      switch (event.type) {
        case 'message_start': {
          const u = AnthropicLite.toOpenAIUsage(event.message?.usage);
          usage.prompt_tokens = u.prompt_tokens;
          yield chunk({ role: 'assistant', content: '' }, { usage: { ...usage } });
          break;
        }
        case 'content_block_start': {
          const block = event.content_block;
          if (block?.type === 'tool_use') {
            // The provider's stream handler executes one tool call per round (it folds every
            // tool_calls chunk into the first). Surface and record only the first tool_use so the
            // replayed assistant round never carries a call that got no result.
            if (toolCallCount > 0) {
              this.log(`Ignoring additional tool_use "${block.name}" - one tool call per round is supported.`);
              break;
            }
            toolCallIndexByBlock[event.index] = toolCallCount++;
            toolUseByBlock[event.index] = { id: block.id, name: block.name, inputJson: '' };
            roundToolUses.push(toolUseByBlock[event.index]);
            yield chunk({
              tool_calls: [{
                index: toolCallIndexByBlock[event.index],
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: '' },
              }],
            });
          } else if (block?.type === 'text' && block.text) {
            roundText += block.text;
            yield chunk({ content: block.text });
          } else if (block?.type === 'thinking' && block.thinking) {
            yield chunk({ reasoning_content: block.thinking });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            roundText += delta.text;
            yield chunk({ content: delta.text });
          } else if (delta?.type === 'thinking_delta' && delta.thinking) {
            yield chunk({ reasoning_content: delta.thinking });
          } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
            if (!toolUseByBlock[event.index]) break; // arguments of an ignored extra tool_use
            toolUseByBlock[event.index].inputJson += delta.partial_json;
            yield chunk({
              tool_calls: [{
                index: toolCallIndexByBlock[event.index] ?? 0,
                type: 'function',
                function: { arguments: delta.partial_json },
              }],
            });
          }
          break;
        }
        case 'message_delta': {
          if (event.usage) {
            usage.completion_tokens = Number(event.usage.output_tokens ?? usage.completion_tokens);
            usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
          }
          if (event.delta?.stop_reason) finishReason = AnthropicLite.toOpenAIFinishReason(event.delta.stop_reason);
          break;
        }
        case 'message_stop': {
          this.recordAssistantRound(roundText, roundToolUses);
          yield {
            id: chunkId,
            object: 'chat.completion.chunk',
            model: body.model,
            choices: [{ index: 0, delta: {}, finish_reason: finishReason ?? 'stop' }],
            usage: { ...usage },
          };
          return;
        }
        case 'error': {
          throw new Error(event.error?.message || 'Anthropic stream returned an error');
        }
        default:
          break; // ping, content_block_stop, ...
      }
    }

    // Stream ended without a `message_stop` (connection dropped) - still close the round for the caller.
    this.recordAssistantRound(roundText, roundToolUses);
    yield {
      id: chunkId,
      object: 'chat.completion.chunk',
      model: body.model,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason ?? 'stop' }],
      usage: { ...usage },
    };
  }

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  async retrieveModel(model: string) {
    const url = `${this.baseURL}/models/${encodeURIComponent(model)}`;
    const response = await fetch(url, { method: 'GET', headers: this.baseHeaders() });
    if (!response.ok) await this.throwForResponse(response);
    return response.json();
  }

  /**
   * Lists models in the OpenAI `{ data: [{ id, object, owned_by }] }` shape so the provider UI
   * can treat every external provider the same. Anthropic paginates with `has_more`/`last_id`.
   */
  async listModels() {
    const models: any[] = [];
    let afterId: string | null = null;
    let guard = 0;

    do {
      const url = `${this.baseURL}/models?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`;
      this.log('listModels', url, { hasApiKey: !!this.apiKey });

      const response = await fetch(url, { method: 'GET', headers: this.baseHeaders() });
      if (!response.ok) await this.throwForResponse(response);
      const page = await response.json();
      const data: any[] = Array.isArray(page?.data) ? page.data : [];
      models.push(...data);
      afterId = page?.has_more && page?.last_id ? page.last_id : null;
      guard++;
    } while (afterId && guard < 10);

    return {
      object: 'list',
      data: models.map((model) => ({
        id: model.id,
        object: 'model',
        owned_by: 'anthropic',
        name: model.display_name ?? model.id,
        created_at: model.created_at,
        max_tokens: model.max_tokens,
      })),
    };
  }
}
