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
  endMeasurement: (reportedUsage: { [key: string]: number, completion_tokens?: any, prompt_tokens?: any }) => StreamMetrics;
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

    stream.endMeasurement = (reportedUsage = {}) => {
      const end = Date.now();
      const duration = (end - stream.start) / 1000;

      // Merge the reported usage with the existing metrics
      // so the math in the metrics object is correct when calculating
      stream.metrics = {
        ...stream.metrics,
        ...reportedUsage,
      };

      stream.metrics.total_tokens =
        stream.metrics.prompt_tokens + (stream.metrics.completion_tokens || 0);
      stream.metrics.outputTps = stream.metrics.completion_tokens / duration;
      stream.metrics.duration = duration;
      return stream.metrics;
    };
    return stream;
  }
}
