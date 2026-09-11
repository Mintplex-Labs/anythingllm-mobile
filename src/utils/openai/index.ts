import { getStreamingFetch, readSSEDataLines } from '@/utils/streamingFetch';
import { safeParseJSON } from '../device';

type IMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type IAsyncChatCompletionRequestBody = {
  model: string;
  messages: IMessage[];
  temperature?: number;
}

/**
 * Per-request options. Aborting the `controller` or `signal` cancels the underlying
 * fetch so the provider stops generating (and billing) for a response nobody will read.
 */
export type IRequestOptions = {
  controller?: AbortController;
  signal?: AbortSignal;
}

export type IOpenAILiteOptions = {
  apiKey?: string | null;
  baseURL?: string;
  /**
   * Extra headers sent with every request. Used for provider attribution
   * (eg: OpenRouter's `HTTP-Referer`/`X-Title`) or vendor specific auth headers.
   */
  defaultHeaders?: Record<string, string>;
}

export default class OpenAILite {
  private baseURL: string = 'https://api.openai.com/v1';
  private apiKey: string | null = null;
  private defaultHeaders: Record<string, string> = {};
  private streamingFetch: typeof fetch;

  public models = {
    list: () => this.listModels()
  };

  public chat = {
    completions: {
      create: (body: any, options?: any) => {
        if (body.stream) return this.streamChatCompletion(body, options)
        return this.createChatCompletion(body, options)
      }
    },
  }

  constructor({ apiKey, baseURL, defaultHeaders }: IOpenAILiteOptions = {}) {
    this.apiKey = apiKey || this.apiKey;
    this.baseURL = baseURL || this.baseURL;
    this.defaultHeaders = defaultHeaders || {};
    this.streamingFetch = getStreamingFetch();
  }

  private log = (text: string, ...args: any[]) => {
    console.log(`🛠️ \x1b[33m[OpenAILite]\x1b[0m ${text}`, ...args);
  }

  /**
   * Common headers for every request.
   * `ngrok-skip-browser-warning` makes free ngrok tunnels return the upstream
   * response instead of their HTML interstitial page. Harmless elsewhere.
   */
  private baseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      ...this.defaultHeaders,
    };
  }

  /**
   * Format the URL to ensure it is valid
   * - if the path name has double slashes, eg: //v1, replace them with a single slash (some providers can handle this, but not all)
   * @param urlString - The URL string to format
   * @returns The formatted URL string
   */
  private formatURL(urlString: string) {
    try {
      const url = new URL(urlString);
      // if the path name has double slashes, eg: //v1, replace them with a single slash
      url.pathname = url.pathname.replace(/\/\//g, '/');
      return url.toString();
    } catch (error) {
      return urlString;
    }
  }

  /**
   * Resolves the abort signal for a request from the request options.
   * Callers may pass either a `controller` (legacy) or a bare `signal`.
   */
  private signalFromOptions(options: IRequestOptions = {}): AbortSignal | undefined {
    return options.signal ?? options.controller?.signal ?? undefined;
  }

  async createChatCompletion(body: IAsyncChatCompletionRequestBody, options: IRequestOptions = {}) {
    const formattedURL = this.formatURL(`${this.baseURL}/chat/completions`);
    this.log('createChatCompletion', formattedURL, { hasApiKey: !!this.apiKey });
    const signal = this.signalFromOptions(options);
    return await fetch(formattedURL, {
      method: 'POST',
      headers: this.baseHeaders(),
      body: JSON.stringify({
        ...body,
        stream: false,
      }),
      ...(signal ? { signal } : {}),
      // @ts-ignore
      reactNative: { textStreaming: true }
    })
      .then(res => res.json())
      .catch(err => {
        console.error(err);
        throw err;
      });
  }

  async *streamChatCompletion(body: IAsyncChatCompletionRequestBody, options: IRequestOptions = {}) {
    const formattedURL = this.formatURL(`${this.baseURL}/chat/completions`);
    this.log('streamingChatCompletion', formattedURL, { hasApiKey: !!this.apiKey });
    const signal = this.signalFromOptions(options);
    const response = await this.streamingFetch(formattedURL, {
      method: 'POST',
      headers: this.baseHeaders(),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
      // @ts-ignore
      reactNative: { textStreaming: true },
    });

    // Non-2xx responses carry a JSON error body rather than an event stream - surface the message
    // so the chat shows "Invalid API key" instead of silently ending with no tokens.
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const parsed = safeParseJSON(text);
      const message = parsed?.error?.message || parsed?.message || text.slice(0, 200) || response.statusText;
      throw new Error(`Request failed with status ${response.status}: ${message}`);
    }

    const stream = (response as any).body;
    if (!stream) return;

    for await (const data of readSSEDataLines(stream)) {
      try {
        const parsed = safeParseJSON(data);
        yield parsed;
      } catch (e) {
        console.error('Failed to parse streaming response:', e);
      }
    }
  }

  async listModels() {
    const formattedURL = this.formatURL(`${this.baseURL}/models`);
    this.log('listModels', formattedURL, { hasApiKey: !!this.apiKey });
    const res = await fetch(formattedURL, {
      method: 'GET',
      headers: this.baseHeaders(),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Request failed with status ${res.status}: ${text.slice(0, 200)}`);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const looksLikeHtml = text.trim().startsWith('<');
      throw new Error(looksLikeHtml
        ? 'Endpoint returned HTML instead of JSON - check the base URL (is the /v1 prefix missing?) or any proxy in front of it.'
        : `Endpoint returned a non-JSON response: ${text.slice(0, 200)}`);
    }

    // Some providers (eg: Together AI) return the bare array instead of the OpenAI `{ data: [] }` envelope.
    if (Array.isArray(parsed)) parsed = { object: 'list', data: parsed };
    if (!Array.isArray(parsed?.data)) throw new Error('Endpoint response did not contain a "data" array of models.');
    return parsed;
  }
}
