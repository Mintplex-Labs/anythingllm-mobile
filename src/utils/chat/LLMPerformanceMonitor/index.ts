import TokenManager from "@/utils/tiktoken";

export interface StreamMetrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  outputTps: number;
  duration: number;
}

export interface MonitoredStream {
  start: number;
  duration: number;
  metrics: StreamMetrics;
  /** Restarts the clock when the first chunk arrives so network latency and prompt processing do not count as generation time. */
  markFirstChunk: () => void;
  /** `endedAt` pins the end time when the stream is drained past `finish_reason` for trailing usage. */
  endMeasurement: (reportedUsage: { [key: string]: number, completion_tokens?: any, prompt_tokens?: any }, endedAt?: number) => StreamMetrics;
}

export default class LLMPerformanceMonitor {
  static tokenManager = new TokenManager();
  /**
   * Counts the tokens in the messages.
   */
  static countTokens(messages: string[] = []) {
    try {
      return this.tokenManager.statsFrom(messages);
    } catch (e) {
      return 0;
    }
  }
  /**
   * Counts the tokens in a single string - the fallback for providers that do not report usage.
   */
  static countStringTokens(text: string = "") {
    try {
      return this.tokenManager.countFromString(text);
    } catch (e) {
      return 0;
    }
  }
  /**
   * Wraps a function and logs the duration (in seconds) of the function call.
   */
  static measureAsyncFunction(func: () => Promise<any>) {
    return (async () => {
      const start = Date.now();
      const output = await func; // is a promise
      const end = Date.now();
      return { output, duration: (end - start) / 1000 };
    })();
  }

  /**
   * Wraps a completion stream and and attaches a start time and duration property to the stream.
   * Also attaches an `endMeasurement` method to the stream that will calculate the duration of the stream and metrics.
   * `duration` is reported in milliseconds (same unit as the on-device provider and the chat UI).
   */
  static async measureStream(
    func: () => Promise<any>,
    messages: string[] = [],
    runPromptTokenCalculation: boolean = true
  ) {
    const stream: any = await func;
    stream.start = Date.now();
    stream.duration = 0;
    stream.metrics = {
      completion_tokens: 0,
      prompt_tokens: runPromptTokenCalculation ? this.countTokens(messages) : 0,
      total_tokens: 0,
      outputTps: 0,
      duration: 0,
    };

    // The stream is lazy, so `start` above is set before the request is even sent. Measuring from
    // the first chunk keeps TTFT (network, prompt processing, hidden thinking) out of the TPS math.
    let sawFirstChunk = false;
    stream.markFirstChunk = () => {
      if (sawFirstChunk) return;
      sawFirstChunk = true;
      stream.start = Date.now();
    };

    stream.endMeasurement = (reportedUsage = {}, endedAt?: number) => {
      const end = endedAt ?? Date.now();
      const durationMs = Math.max(end - stream.start, 1);

      // Merge the reported usage with the existing metrics
      // so the math in the metrics object is correct when calculating
      stream.metrics = {
        ...stream.metrics,
        ...reportedUsage,
      };

      stream.metrics.total_tokens =
        stream.metrics.prompt_tokens + (stream.metrics.completion_tokens || 0);
      stream.metrics.outputTps = (stream.metrics.completion_tokens || 0) / (durationMs / 1000);
      stream.metrics.duration = durationMs;
      stream.duration = durationMs;
      return stream.metrics;
    };
    return stream;
  }
}
