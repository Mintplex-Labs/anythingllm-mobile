import i18n from '@/i18n';
import { getStreamingFetch, readSSEDataLines } from '@/utils/streamingFetch';
import { safeParseJSON } from '../device';
import type { IRequestOptions } from '@/utils/openai';
import { CHATGPT_MANAGE_USAGE_URL } from '@/utils/chatgpt/constants';

/**
 * A tiny client for the OpenAI Responses API that exposes the same surface as `OpenAILite`
 * (`chat.completions.create`, `models.list`) and speaks OpenAI chat shapes on both sides - like `AnthropicLite`,
 * so `BaseOpenAILikeProvider` needs no special casing:
 *  - chat-completion request bodies are translated to Responses input items (`instructions`, `function_call`,
 *    `function_call_output`, `input_image`...)
 *  - Responses stream events are translated back to chat-completion chunks.
 *
 * Used by OpenAI (API key) - newer models only support tool calling on `/responses` and answer 400 on
 * `/chat/completions` - and by ChatGPT (Sign in with ChatGPT plan usage, `planUsage`).
 *
 * Every request streams and is never stored (`store: false`) - the app keeps its own history and never uses
 * `previous_response_id`. Plan usage also requires both, so non-streaming calls are streamed and collected here.
 */

export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

export type IResponsesLiteOptions = {
  baseURL?: string;
  apiKey?: string | null;
  /**
   * OAuth token source (Sign in with ChatGPT). Used instead of `apiKey`; a 401 refreshes the token and retries
   * the request once.
   */
  getAccessToken?: (options: { forceRefresh?: boolean }) => Promise<string>;
  /**
   * ChatGPT plan usage. Rejects `temperature` (and other sampling params) outright, so it is never sent.
   * See "Preview limitations" in the SIWC docs.
   */
  planUsage?: boolean;
};

/**
 * Optional request fields a model may reject with a 400 `unsupported_parameter` (eg: `temperature` on reasoning
 * models). The request is retried once without the field and the model is remembered, so every later request
 * to it leaves the field out.
 */
const DROPPABLE_PARAMS = ['temperature'] as const;

type OpenAIToolDefinition = {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, any> };
};

/**
 * Plan usage errors from the docs ("Errors and recovery"), shown to the user in place of the raw API message.
 * Usage-limit errors point at ChatGPT's usage settings, which the SIWC UI guidelines require.
 */
const PLAN_ERROR_KEYS: Record<string, string> = {
  subscription_sharing_user_not_eligible: 'providers.chatgpt.errors.not_eligible',
  subscription_sharing_usage_limit_exceeded: 'providers.chatgpt.errors.usage_limit',
  subscription_sharing_usage_unavailable: 'providers.chatgpt.errors.usage_unavailable',
  subscription_sharing_unsupported_capability: 'providers.chatgpt.errors.unsupported',
};

export default class ResponsesLite {
  private baseURL: string = OPENAI_API_BASE_URL;
  private apiKey: string | null = null;
  private getAccessToken: IResponsesLiteOptions['getAccessToken'];
  private planUsage: boolean = false;
  private streamingFetch: typeof fetch;
  /** `${model}:${param}` pairs a model rejected - see `DROPPABLE_PARAMS`. */
  private static unsupportedParams = new Set<string>();

  public models = {
    list: () => this.listModels(),
  };

  public chat = {
    completions: {
      create: (body: any, options?: IRequestOptions) => {
        if (body.stream) return this.streamChatCompletion(body, options);
        return this.createChatCompletion(body, options);
      },
    },
  };

  constructor({ baseURL, apiKey, getAccessToken, planUsage }: IResponsesLiteOptions = {}) {
    this.baseURL = (baseURL || this.baseURL).replace(/\/+$/, '');
    this.apiKey = apiKey || null;
    this.getAccessToken = getAccessToken;
    this.planUsage = !!planUsage;
    this.streamingFetch = getStreamingFetch();
  }

  private log = (text: string, ...args: any[]) => {
    console.log(`🛠️ \x1b[33m[ResponsesLite]\x1b[0m ${text}`, ...args);
  };

  private signalFromOptions(options: IRequestOptions = {}): AbortSignal | undefined {
    return options.signal ?? options.controller?.signal ?? undefined;
  }

  /**
   * Sends an authenticated request. With an OAuth token source a 401 refreshes the token and retries once
   * (eg: the token was revoked from ChatGPT's settings before it expired).
   */
  private async authorizedFetch(path: string, init: RequestInit, streaming = false): Promise<Response> {
    const doFetch = streaming ? this.streamingFetch : fetch;
    const send = async (forceRefresh: boolean) => {
      const token = this.getAccessToken ? await this.getAccessToken({ forceRefresh }) : this.apiKey;
      return doFetch(`${this.baseURL}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // @ts-ignore
        ...(streaming ? { reactNative: { textStreaming: true } } : {}),
      });
    };
    const response = await send(false);
    if (response.status !== 401 || !this.getAccessToken) return response;
    this.log('Access token rejected - refreshing and retrying once');
    return send(true);
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  /** Turns an API error (body or stream event) into a user-facing Error, mapping plan usage codes. */
  static errorFrom(error: { code?: string; message?: string } | null | undefined, status?: number): Error {
    const key = error?.code ? PLAN_ERROR_KEYS[error.code] : undefined;
    if (key) return new Error(i18n.t(key, { url: CHATGPT_MANAGE_USAGE_URL }));
    const message = error?.message || (status ? `Request failed with status ${status}` : 'The model returned an error');
    return new Error(status ? `Request failed with status ${status}: ${message}` : message);
  }

  /** The error object of a failed response: `{ error: {...} }`, a bare `{ code, message }`, or plain text. */
  private static async readError(response: Response): Promise<{ code?: string; message?: string; param?: string }> {
    const text = await response.text().catch(() => '');
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return parsed?.error ?? (parsed?.code ? parsed : null) ?? { message: text.slice(0, 200) || response.statusText };
  }

  private async throwForResponse(response: Response): Promise<never> {
    throw ResponsesLite.errorFrom(await ResponsesLite.readError(response), response.status);
  }

  /** The `DROPPABLE_PARAMS` entry a 400 complains about, if any. */
  private static rejectedParam(error: { code?: string; message?: string; param?: string }): string | null {
    for (const param of DROPPABLE_PARAMS) {
      if (error.param === param) return param;
      if (error.message?.includes(`'${param}'`) && /unsupported|not supported/i.test(error.message)) return param;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Chat completions -> Responses request translation
  // ---------------------------------------------------------------------------

  private static textOf(content: any): string {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);
    return content.filter((part: any) => part?.type === 'text').map((part: any) => part.text ?? '').join('\n');
  }

  /** User message content -> Responses input content parts (text and data-URL images). */
  private static toUserContent(content: any): string | any[] {
    if (!Array.isArray(content)) return ResponsesLite.textOf(content);
    const parts: any[] = [];
    for (const part of content) {
      if (!part) continue;
      if (part.type === 'text' && part.text?.trim()) parts.push({ type: 'input_text', text: part.text });
      else if (part.type === 'image_url' && part.image_url?.url) parts.push({ type: 'input_image', image_url: part.image_url.url });
    }
    return parts;
  }

  /**
   * Chat messages -> `instructions` + Responses input items.
   *  - `system` messages become `instructions` (system-role items are rejected under plan usage).
   *  - assistant `tool_calls` become `function_call` items and `tool` results with a matching
   *    `tool_call_id` become `function_call_output` items. A result whose call is not in the history
   *    (none should be, but the API rejects orphans) is kept as plain user text instead.
   */
  static toResponsesInput(messages: any[] = []): { instructions: string | undefined; input: any[] } {
    const instructions: string[] = [];
    const input: any[] = [];
    const knownCallIds = new Set<string>();

    for (const message of messages) {
      if (!message) continue;
      switch (message.role) {
        case 'system':
        case 'developer': {
          const text = ResponsesLite.textOf(message.content);
          if (text.trim()) instructions.push(text);
          break;
        }
        case 'assistant': {
          const text = ResponsesLite.textOf(message.content);
          if (text.trim()) input.push({ role: 'assistant', content: text });
          for (const call of message.tool_calls ?? []) {
            if (!call?.id || !call.function?.name) continue;
            knownCallIds.add(call.id);
            input.push({
              type: 'function_call',
              call_id: call.id,
              name: call.function.name,
              arguments: typeof call.function.arguments === 'string' ? call.function.arguments || '{}' : JSON.stringify(call.function.arguments ?? {}),
            });
          }
          break;
        }
        case 'tool':
        case 'function': {
          const output = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '');
          if (message.tool_call_id && knownCallIds.has(message.tool_call_id)) {
            input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: output || 'Tool executed successfully.' });
          } else {
            const label = message.signature || message.function || message.name || 'tool';
            input.push({ role: 'user', content: `Function: ${label}\nResult: ${output}` });
          }
          break;
        }
        case 'user':
        default: {
          const content = ResponsesLite.toUserContent(message.content);
          if (typeof content === 'string' ? content.trim() : content.length > 0) input.push({ role: 'user', content });
          break;
        }
      }
    }

    return { instructions: instructions.length > 0 ? instructions.join('\n\n') : undefined, input };
  }

  private static formatTools(tools: OpenAIToolDefinition[] = []) {
    return tools
      .filter((tool) => tool?.function?.name)
      .map((tool) => ({
        type: 'function',
        name: tool.function.name,
        description: tool.function.description ?? '',
        parameters: tool.function.parameters ?? { type: 'object', properties: {} },
        strict: false,
      }));
  }

  private buildRequestBody(body: any) {
    const { instructions, input } = ResponsesLite.toResponsesInput(body.messages);
    const tools = ResponsesLite.formatTools(body.tools);
    const sendTemperature = typeof body.temperature === 'number' && !this.planUsage &&
      !ResponsesLite.unsupportedParams.has(`${body.model}:temperature`);
    return {
      model: body.model,
      ...(instructions ? { instructions } : {}),
      input,
      store: false,
      stream: true,
      ...(sendTemperature ? { temperature: body.temperature } : {}),
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    };
  }

  /**
   * POSTs `/responses`. When the model rejects one of `DROPPABLE_PARAMS` the model is remembered and the
   * request is sent again without it - once per parameter.
   */
  private async openResponseStream(body: any, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; attempt <= DROPPABLE_PARAMS.length; attempt++) {
      const response = await this.authorizedFetch('/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(this.buildRequestBody(body)),
        ...(signal ? { signal } : {}),
      }, true);
      if (response.status !== 400) return response;

      const error = await ResponsesLite.readError(response);
      const param = ResponsesLite.rejectedParam(error);
      const key = `${body.model}:${param}`;
      if (!param || ResponsesLite.unsupportedParams.has(key)) throw ResponsesLite.errorFrom(error, response.status);
      this.log(`${body.model} does not support "${param}" - retrying without it`);
      ResponsesLite.unsupportedParams.add(key);
    }
    throw new Error('Request failed with status 400');
  }

  // ---------------------------------------------------------------------------
  // Responses stream -> chat completion chunks
  // ---------------------------------------------------------------------------

  private static toOpenAIUsage(usage: any = {}) {
    const prompt = Number(usage?.input_tokens ?? 0);
    const completion = Number(usage?.output_tokens ?? 0);
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  }

  /**
   * Streams `/responses` and yields OpenAI style chat-completion chunks:
   *  - `response.output_text.delta` -> `delta.content`
   *  - `response.reasoning_summary_text.delta` / `response.reasoning_text.delta` -> `delta.reasoning_content`
   *  - `function_call` output items + `response.function_call_arguments.delta` -> `delta.tool_calls`
   *  - `response.completed` / `response.incomplete` -> `finish_reason` + `usage`
   *  - `response.failed` / `error` -> thrown, with plan usage codes mapped to readable messages
   */
  async *streamChatCompletion(body: any, options: IRequestOptions = {}) {
    this.log('streamChatCompletion', `${this.baseURL}/responses`, { model: body.model });
    const response = await this.openResponseStream(body, this.signalFromOptions(options));
    if (!response.ok) await this.throwForResponse(response);

    const stream = (response as any).body;
    if (!stream) return;

    const chunkId = `chatcmpl-${Date.now()}`;
    const chunk = (delta: Record<string, any>, extra: Record<string, any> = {}) => ({
      id: chunkId,
      object: 'chat.completion.chunk',
      model: body.model,
      choices: [{ index: 0, delta, finish_reason: null }],
      ...extra,
    });
    const finalChunk = (finishReason: string, usage: any) => ({
      id: chunkId,
      object: 'chat.completion.chunk',
      model: body.model,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      usage: ResponsesLite.toOpenAIUsage(usage),
    });

    // Output item id -> the tool call index and arguments streamed so far.
    const toolCalls: Record<string, { index: number; arguments: string }> = {};
    let toolCallCount = 0;

    for await (const data of readSSEDataLines(stream)) {
      const event = safeParseJSON(data);
      if (!event || typeof event !== 'object') continue;

      switch (event.type) {
        case 'response.created':
          yield chunk({ role: 'assistant', content: '' });
          break;
        case 'response.output_text.delta':
          if (event.delta) yield chunk({ content: event.delta });
          break;
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta':
          if (event.delta) yield chunk({ reasoning_content: event.delta });
          break;
        case 'response.output_item.added': {
          const item = event.item;
          if (item?.type !== 'function_call') break;
          const call = { index: toolCallCount++, arguments: item.arguments ?? '' };
          toolCalls[item.id] = call;
          yield chunk({
            tool_calls: [{
              index: call.index,
              id: item.call_id,
              type: 'function',
              function: { name: item.name, arguments: call.arguments },
            }],
          });
          break;
        }
        case 'response.function_call_arguments.delta': {
          const call = toolCalls[event.item_id];
          if (!call || !event.delta) break;
          call.arguments += event.delta;
          yield chunk({ tool_calls: [{ index: call.index, type: 'function', function: { arguments: event.delta } }] });
          break;
        }
        case 'response.output_item.done': {
          // Some models send the arguments only on the finished item - fill in whatever was not streamed.
          const item = event.item;
          const call = item?.type === 'function_call' ? toolCalls[item.id] : undefined;
          if (!call || !item.arguments || call.arguments === item.arguments) break;
          const missing = item.arguments.startsWith(call.arguments) ? item.arguments.slice(call.arguments.length) : '';
          if (!missing) break;
          call.arguments += missing;
          yield chunk({ tool_calls: [{ index: call.index, type: 'function', function: { arguments: missing } }] });
          break;
        }
        case 'response.completed':
          yield finalChunk(toolCallCount > 0 ? 'tool_calls' : 'stop', event.response?.usage);
          return;
        case 'response.incomplete':
          yield finalChunk('length', event.response?.usage);
          return;
        case 'response.failed':
          throw ResponsesLite.errorFrom(event.response?.error);
        case 'error':
          throw ResponsesLite.errorFrom(event.error ?? event);
        default:
          break;
      }
    }

    // The docs only count a response as successful once `response.completed` arrives.
    throw new Error(i18n.t('providers.errors.stream_interrupted'));
  }

  /** Requests always stream (plan usage requires it) - collect the stream into a chat.completion object. */
  async createChatCompletion(body: any, options: IRequestOptions = {}) {
    let content = '';
    let reasoning = '';
    let finishReason: string | null = null;
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];

    for await (const chunk of this.streamChatCompletion(body, options)) {
      const choice = chunk.choices[0];
      const delta: any = choice.delta;
      if (delta.content) content += delta.content;
      if (delta.reasoning_content) reasoning += delta.reasoning_content;
      for (const call of delta.tool_calls ?? []) {
        if (!toolCalls[call.index]) toolCalls[call.index] = { id: call.id, type: 'function', function: { name: call.function?.name ?? '', arguments: '' } };
        toolCalls[call.index].function.arguments += call.function?.arguments ?? '';
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if ((chunk as any).usage) usage = (chunk as any).usage;
    }

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      model: body.model,
      choices: [{
        index: 0,
        finish_reason: finishReason,
        message: {
          role: 'assistant',
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          tool_calls: toolCalls.filter(Boolean),
        },
      }],
      usage,
    };
  }

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  /**
   * Lists models in the OpenAI `{ data: [{ id, object, owned_by }] }` shape. With an API key `/models` already
   * answers that; with a plan token it answers `{ models: [{ slug, display_name, visibility }] }` - only
   * `visibility == "list"` entries are meant to be offered.
   */
  async listModels() {
    const response = await this.authorizedFetch('/models', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response.ok) await this.throwForResponse(response);
    const parsed = await response.json();

    if (Array.isArray(parsed?.models)) {
      return {
        object: 'list',
        data: parsed.models
          .filter((model: any) => model?.slug && (model.visibility === undefined || model.visibility === 'list'))
          .map((model: any) => ({ id: model.slug, object: 'model', owned_by: 'openai', name: model.display_name ?? model.slug })),
      };
    }
    if (Array.isArray(parsed?.data)) return parsed;
    throw new Error('The endpoint did not return a model list.');
  }
}
