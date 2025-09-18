import { polyfill as polyfillFetch } from 'react-native-polyfill-globals/src/fetch';
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

export default class OpenAILite {
  private baseURL: string = 'https://api.openai.com/v1';
  private apiKey: string | null = null;
  private streamingFetch: typeof fetch | null = null;

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

  private setupStreamingFetch() {
    this.log('setupStreamingFetch');
    const originalFetch = global.fetch;
    polyfillFetch();
    this.streamingFetch = global.fetch;
    global.fetch = originalFetch;
    this.log('setupStreamingFetch completed - original fetch restored');
  }

  constructor({ apiKey, baseURL }: { apiKey?: string | null, baseURL?: string } = {}) {
    this.apiKey = apiKey || this.apiKey;
    this.baseURL = baseURL || this.baseURL;
    this.setupStreamingFetch();
  }

  private log = (text: string, ...args: any[]) => {
    console.log(`🛠️ \x1b[33m[OpenAILite]\x1b[0m ${text}`, ...args);
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

  async createChatCompletion(body: IAsyncChatCompletionRequestBody, _options: any = {}) {
    const formattedURL = this.formatURL(`${this.baseURL}/chat/completions`);
    console.log('createChatCompletion', formattedURL, { hasApiKey: !!this.apiKey });
    return await fetch(formattedURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...body,
        stream: false,
      }),
      // @ts-ignore
      reactNative: { textStreaming: true }
    })
      .then(res => res.json())
      .catch(err => {
        console.error(err);
        throw err;
      });
  }

  async *streamChatCompletion(body: IAsyncChatCompletionRequestBody, options: { controller?: AbortController } = {}) {
    const formattedURL = this.formatURL(`${this.baseURL}/chat/completions`);
    console.log('streamingChatCompletion', formattedURL, { hasApiKey: !!this.apiKey });
    const response = await this.streamingFetch!(formattedURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      ...(options.controller ? { signal: options.controller.signal } : {}),
      // @ts-ignore
      reactNative: { textStreaming: true },
    });

    const stream = response.body;
    if (!stream) return;

    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = safeParseJSON(data);
              yield parsed;
            } catch (e) {
              console.error('Failed to parse streaming response:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels() {
    const formattedURL = this.formatURL(`${this.baseURL}/models`);
    console.log('listModels', formattedURL, { hasApiKey: !!this.apiKey });
    return await fetch(formattedURL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      }
    })
      .then(res => res.json())
      .catch(err => {
        console.error(err);
        throw err;
      });
  }
}