import { polyfill as polyfillFetch } from 'react-native-polyfill-globals/src/fetch';

let streamingFetch: typeof fetch | null = null;
// React Native's global object - typed loosely since the project's tsconfig has no DOM/node lib.
const g = globalThis as any;

/**
 * React Native's built in `fetch` buffers the whole response body, so `response.body`
 * is never a readable stream. `react-native-polyfill-globals` swaps in an implementation
 * that supports `reactNative: { textStreaming: true }`, but installing it globally would
 * change the behaviour of every other request in the app. We install it once, keep a
 * reference to the streaming capable `fetch` and immediately restore the original global.
 *
 * Shared by every REST client that needs to read a server-sent-events body (OpenAILite, AnthropicLite).
 */
export function getStreamingFetch(): typeof fetch {
  if (streamingFetch) return streamingFetch;
  const originalFetch = g.fetch;
  polyfillFetch();
  streamingFetch = g.fetch as typeof fetch;
  g.fetch = originalFetch;
  return streamingFetch;
}

/**
 * Reads a server-sent-events body line by line, yielding the payload of every `data:` line.
 * Buffers partial lines across network chunks so a JSON object split over two reads is never
 * handed back in pieces. `[DONE]` sentinels are skipped.
 */
export async function* readSSEDataLines(body: any): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new g.TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // last element is either '' or an incomplete line
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        yield data;
      }
    }

    const tail = buffer.replace(/\r$/, '');
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data && data !== '[DONE]') yield data;
    }
  } finally {
    reader.releaseLock();
  }
}
