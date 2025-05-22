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

  public chat = {
    completions: {
      create: (body: any, options?: any) => {
        if (body.stream) return this.streamChatCompletion(body, options)
        return this.createChatCompletion(body, options)
      }
    }
  }

  constructor({ apiKey, baseURL }: { apiKey?: string | null, baseURL?: string }) {
    this.apiKey = apiKey || this.apiKey;
    this.baseURL = baseURL || this.baseURL;
  }

  async createChatCompletion(body: IAsyncChatCompletionRequestBody, _options: any = {}) {
    return await fetch(`${this.baseURL}/chat/completions`, {
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
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      ...(options.controller ? { signal: options.controller.signal } : {}),
      // @ts-ignore
      reactNative: { textStreaming: true }
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
}