/**
 * Request cancellation shared by every chat path (on-device, external API, remote instance).
 *
 * When the user stops a generation we want the model to stop generating, not just for the
 * UI to stop listening. The chat handler owns one AbortController per turn and hands its
 * signal to the active provider, which binds it to the underlying transport:
 *  - OpenAI-like providers: the fetch `signal` of every chat completion request
 *  - on-device llama.rn: `stopCompletion()` on the native context
 *  - remote AnythingLLM instance: closing the SSE connection (the server aborts on `close`)
 *
 * Mirrors `server/utils/helpers/abortSignals.js` in the desktop app.
 */

export class ChatAbortedError extends Error {
  constructor(message: string = 'Chat aborted by user') {
    super(message);
    this.name = 'ChatAbortedError';
  }
}

/**
 * Whether an error is a cancellation rather than a real failure.
 * Fetch/XHR cancellation surfaces as an `AbortError`; our own aborts as `ChatAbortedError`.
 */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as Error).name;
  return name === 'AbortError' || name === 'ChatAbortedError';
}

/** Throws a `ChatAbortedError` when the signal has already fired. */
export function throwIfAborted(signal?: AbortSignal | null) {
  if (signal?.aborted) throw new ChatAbortedError();
}

/**
 * Combine abort signals so any one of them firing aborts the request.
 * `AbortSignal.any` is not available in Hermes, and returning the lone signal as-is
 * keeps us from registering listeners in the common case.
 */
export function combineAbortSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
  const present = signals.filter(Boolean) as AbortSignal[];
  if (present.length < 2) return present[0] ?? undefined;

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (present.some((signal) => signal.aborted)) abort();
  else present.forEach((signal) => signal.addEventListener('abort', abort, { once: true }));
  return controller.signal;
}

/**
 * Forwards `signal` into `controller` so aborting the session aborts the request.
 * Returns a cleanup function that removes the listener once the request settles.
 */
export function linkAbortSignal(controller: AbortController, signal?: AbortSignal | null): () => void {
  if (!signal) return () => { };
  if (signal.aborted) {
    controller.abort();
    return () => { };
  }
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
