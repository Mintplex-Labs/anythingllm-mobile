import {
  initLlama,
  LlamaContext,
  type CompletionParams,
  type NativeCompletionResult,
  type TokenData,
} from 'llama.rn';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Model } from '@/utils/types';
import { defaultModels } from '@/utils/models';
import { stops } from '@/utils/chat';
import { ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import type OnDeviceProvider from '@/utils/AiProviders/onDevice/index';
import { getDefaultContextLength } from '@/utils/contextLength';
import { throwIfAborted } from '@/utils/chat/abort';

export type NativeLlamaChatMessage = {
  role: string;
  content: string;
  [key: string]: any;
};

export type ILlamaRnStreamCallback = (token: string) => void;

export type OnDeviceRuntimeInfo = {
  runtime: 'llama.rn';
  /** ggml devices the context runs on. Always CPU - Hexagon/OpenCL offload is deliberately not used (too slow in practice). */
  devices: string[];
  contextLength: number;
  supportsTools: boolean;
  supportsJinja: boolean;
};

/**
 * On-device GGUF runtime backed by llama.rn (llama.cpp).
 *
 * Owns a single `LlamaContext` for the selected model and handles:
 *  - loading/unloading with an idle keep-alive timer
 *  - keeping the prompt inside the workspace's context window
 *  - native (jinja/chat.cpp) tool calling when the model's template supports it
 */
export default class LlamaRnWrapper {
  /**
   * Defaults are shared with `Workspace` so inference behaves the same when a workspace has no override.
   * On overflow, the oldest chat turns are dropped before the prompt is sent (see `fitMessagesToContext`)
   * and llama.cpp context shifting is enabled as a last line of defence during generation.
   */
  /** Scales with device RAM up to a max of 2048 - see src/utils/contextLength.ts */
  static get DEFAULT_CONTEXT_LENGTH(): number {
    return getDefaultContextLength();
  }
  static DEFAULT_TEMPERATURE = 0.7;

  /**
   * llama.rn defaults to -1 (unbounded) which we never want on a phone.
   */
  static DEFAULT_N_PREDICT = 2048;

  /** Prompt-processing batch size. Larger batches are faster but use more memory. */
  static N_BATCH = 512;

  /**
   * Share of the context window kept free for the model's answer when trimming history.
   * With a 1024 token window we keep ~350 tokens for the response.
   */
  static RESPONSE_RESERVE_RATIO = 0.35;

  private parent: OnDeviceProvider;
  private model: string;
  private ggufFilePath: string | null = null;
  private context: LlamaContext | null = null;
  private initializing: Promise<boolean> | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInterval = 1000 * 60 * 5;
  private isGenerating = false;

  constructor({ model, parent }: { model: string; parent: OnDeviceProvider }) {
    this.model = model;
    this.parent = parent;
    this.presetGGUFFilePath();
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  };

  get name() {
    return 'llama.rn';
  }

  get modelDefinition(): Model | undefined {
    return defaultModels.find(model => model.id === this.model) as Model | undefined;
  }

  get temperature() {
    return this.parent.workspace?.temperature ?? LlamaRnWrapper.DEFAULT_TEMPERATURE;
  }

  get nPredict() {
    return LlamaRnWrapper.DEFAULT_N_PREDICT;
  }

  get contextLength() {
    return this.parent.workspace?.contextLength ?? LlamaRnWrapper.DEFAULT_CONTEXT_LENGTH;
  }

  get isLoaded() {
    return !!this.context;
  }

  /**
   * True when the loaded model ships a jinja template that knows how to render tools
   * and parse tool calls (Qwen, Gemma 4, Granite, Llama 3.x, ...). When false we do not
   * send tools at all - chat.cpp would otherwise fall back to a generic JSON-only mode.
   */
  get supportsNativeToolCalling() {
    const jinja = this.context?.model?.chatTemplates?.jinja;
    if (!jinja) return false;
    return !!jinja.toolUse || !!jinja.defaultCaps?.tools;
  }

  get runtimeInfo(): OnDeviceRuntimeInfo | null {
    if (!this.context) return null;
    return {
      runtime: 'llama.rn',
      devices: this.context.devices ?? [],
      contextLength: this.contextLength,
      supportsTools: this.supportsNativeToolCalling,
      supportsJinja: this.context.isJinjaSupported(),
    };
  }

  /**
   * Presets the gguf file path for extra models we manually support
   * we have to manually set the gguf file path because we may name the model differently
   */
  private presetGGUFFilePath() {
    if (!this.modelDefinition?.ggufFilePath) return;
    this.ggufFilePath = `${RNFS.DocumentDirectoryPath}/models/gguf/${this.modelDefinition.ggufFilePath}`;
  }

  async determineGgufFilePath() {
    if (!this.ggufFilePath) {
      this.log('GGUF file location is not yet set - will find a gguf file in the model directory.');
      let path = `${RNFS.DocumentDirectoryPath}/models/gguf/${this.model}`;

      if (path.endsWith('.gguf')) {
        if (await RNFS.exists(path)) {
          this.ggufFilePath = path;
          this.log(`GGUF file found at ${this.ggufFilePath}`);
          return this.ggufFilePath;
        } else {
          this.log(`GGUF file not found at ${path} - trying to find via subdir`);
          path = path.split('/').slice(0, -1).join('/');
          this.log(`Retrying to find GGUF file in ${path}`);
        }
      }

      const files = await RNFS.readDir(path);
      const ggufFile = files.find(file => file.name.endsWith('.gguf'));
      if (!ggufFile) throw new Error(`LlamaRnWrapper::ggufFilePath: No gguf file found for model ${this.model}`);
      this.ggufFilePath = `${path}/${ggufFile.name}`;
    }
    return this.ggufFilePath;
  }

  /**
   * Loads the model into a llama.cpp context. Safe to call repeatedly - concurrent
   * callers share the same in-flight load.
   */
  async initialize(): Promise<boolean> {
    if (this.context) return true;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        if (!this.ggufFilePath) await this.determineGgufFilePath();
        if (!this.ggufFilePath) throw new Error(`LlamaRnWrapper::initialize: No gguf file found for model ${this.model}`);

        this.log(`Loading ${this.model} @ ${this.contextLength} context length`);
        this.context = await this.createContext();
        this.log(`${this.name} initialized`, {
          devices: this.context.devices,
          nativeToolCalling: this.supportsNativeToolCalling,
          jinja: this.context.isJinjaSupported(),
        });
        return true;
      } catch (error) {
        console.error('Failed to initialize model:', error);
        throw error;
      } finally {
        this.initializing = null;
      }
    })();
    return this.initializing;
  }

  private async createContext() {
    const nCtx = this.contextLength;
    return initLlama({
      model: this.ggufFilePath!,
      n_ctx: nCtx,
      n_batch: Math.min(LlamaRnWrapper.N_BATCH, nCtx),
      n_ubatch: Math.min(LlamaRnWrapper.N_BATCH, nCtx),
      use_mlock: true,
      use_mmap: true,
      // Shift the KV cache instead of failing if a long answer runs past the window.
      ctx_shift: true,
      // CPU only. The Hexagon NPU / OpenCL backends in llama.cpp are experimental and slower
      // than the CPU path on the phones we target, so we never offload layers.
      n_gpu_layers: 0,
      ...(this.modelDefinition?.chatTemplateString ? { chat_template: this.modelDefinition.chatTemplateString } : {}),
    });
  }

  /**
   * Sampling params recommended by the model author (from the model definition) that
   * are not user configurable, plus the workspace temperature which always wins.
   */
  private get completionParams(): Partial<CompletionParams> {
    const params: Record<string, any> = {};
    if (this.modelDefinition?.completionSettings) {
      for (const [key, value] of Object.entries(this.modelDefinition.completionSettings)) params[key] = value;
    }
    params.temperature = this.temperature;
    return params;
  }

  private keepAlive() {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.log(`Keep alive timer reset for ${this.keepAliveInterval}ms`);
    } else this.log(`Starting keep alive timer for ${this.keepAliveInterval}ms`);

    this.keepAliveTimer = setTimeout(() => {
      this.keepAliveTimer = null;
      if (this.isGenerating) return this.keepAlive(); // never unload mid-generation
      this.cleanup();
    }, this.keepAliveInterval);
  }

  /**
   * Renders the chat through the model's template and counts the tokens - the same
   * thing llama.rn does internally right before `completion()`.
   */
  private async countPromptTokens(messages: NativeLlamaChatMessage[], tools?: any[]): Promise<number> {
    if (!this.context) throw new Error('LlamaRnWrapper::countPromptTokens: Model not initialized');
    const formatted = await this.context.getFormattedChat(messages as any, null, {
      jinja: this.context.isJinjaSupported(),
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? 'auto' : undefined,
    });
    const { tokens } = await this.context.tokenize(formatted.prompt);
    return tokens.length;
  }

  /**
   * Drops the oldest chat turns until the rendered prompt leaves room for a response.
   * The system prompt (index 0) and the latest user message are always kept.
   * Returns the (possibly trimmed) messages and how many tokens they render to.
   */
  async fitMessagesToContext(messages: NativeLlamaChatMessage[], tools?: any[]): Promise<{ messages: NativeLlamaChatMessage[]; promptTokens: number; dropped: number }> {
    const nCtx = this.contextLength;
    const reserve = Math.min(this.nPredict, Math.max(128, Math.floor(nCtx * LlamaRnWrapper.RESPONSE_RESERVE_RATIO)));
    const budget = Math.max(64, nCtx - reserve);

    let working = [...messages];
    let dropped = 0;
    let promptTokens = await this.countPromptTokens(working, tools);

    while (promptTokens > budget) {
      // [system, ...history, lastUser] -> remove the oldest history entry.
      const droppable = working.length - (working[0]?.role === 'system' ? 1 : 0) - 1;
      if (droppable <= 0) break;
      const removeAt = working[0]?.role === 'system' ? 1 : 0;
      working.splice(removeAt, 1);
      dropped++;
      promptTokens = await this.countPromptTokens(working, tools);
    }

    if (dropped) this.log(`Dropped ${dropped} oldest message(s) to fit ${nCtx} token context (prompt now ${promptTokens} tokens, budget ${budget})`);
    if (promptTokens > budget) this.log(`Prompt is ${promptTokens} tokens which exceeds the ${budget} token budget even after trimming - relying on context shifting.`);
    return { messages: working, promptTokens, dropped };
  }

  private toCompleteResponse(result: NativeCompletionResult): ICompleteResponse {
    if (result.context_full) this.log('Context window filled during generation - the response may have been cut short. Consider raising the workspace context length.');
    if (result.truncated) this.log('Prompt was truncated by llama.cpp to fit the context window.');
    return {
      // `content` has reasoning/tool call markup already parsed out by chat.cpp; `text` is the raw output.
      textResponse: result.content ?? result.text ?? '',
      toolCalls: result.tool_calls?.length ? result.tool_calls : undefined,
      metrics: {
        prompt_tokens: result.timings.prompt_n,
        completion_tokens: result.timings.predicted_n,
        total_tokens: result.timings.prompt_n + result.timings.predicted_n,
        outputTps: result.timings.predicted_per_second,
        duration: result.timings.predicted_ms,
      },
    };
  }

  private async runCompletion(
    messages: NativeLlamaChatMessage[],
    availableTools: any[] = [],
    onToken?: (data: TokenData) => void,
    signal?: AbortSignal | null,
  ): Promise<NativeCompletionResult> {
    this.keepAlive();
    if (!this.context) await this.initialize();
    if (!this.context) throw new Error('LlamaRnWrapper::runCompletion: Model not initialized');

    const useTools = this.supportsNativeToolCalling && availableTools.length > 0;
    if (availableTools.length && !useTools) this.log(`Model template has no tool support - ${availableTools.length} tool(s) will not be offered.`);

    const tools = useTools ? availableTools : undefined;
    const { messages: fitted } = await this.fitMessagesToContext(messages, tools);

    // The user may have stopped while the model was loading or the prompt was being fitted -
    // never start generating in that case. Once generating, an abort interrupts the native loop.
    throwIfAborted(signal);
    const onAbort = () => { this.stop().catch((e) => this.log('Failed to stop generation on abort', e)); };
    signal?.addEventListener('abort', onAbort, { once: true });

    this.isGenerating = true;
    try {
      return await this.context.completion(
        {
          messages: fitted as any,
          n_predict: this.nPredict,
          stop: [...stops],
          jinja: this.context.isJinjaSupported(),
          // Keep <think> blocks inline - the chat UI already extracts them into the thought chain.
          reasoning_format: 'none',
          ...(useTools ? { tools, tool_choice: 'auto' } : {}),
          ...this.completionParams,
        },
        onToken,
      );
    } finally {
      this.isGenerating = false;
      signal?.removeEventListener('abort', onAbort);
      this.keepAlive();
    }
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response
   */
  async getChatCompletion(messages: NativeLlamaChatMessage[]): Promise<ICompleteResponse> {
    const result = await this.runCompletion(messages);
    return this.toCompleteResponse(result);
  }

  /**
   * Streams the chat completion from the model.
   * Tool calls are rendered/parsed natively by llama.cpp so only the conversational
   * content reaches the UI - the `<tool_call>` markup itself is never streamed.
   */
  async streamGetChatCompletion(
    messages: NativeLlamaChatMessage[],
    callback: ILlamaRnStreamCallback,
    availableTools: any[] = [],
    signal: AbortSignal | null = null,
  ): Promise<ICompleteResponse> {
    let streamed = '';
    const result = await this.runCompletion(messages, availableTools, (data: TokenData) => {
      // `content` is the accumulated, parsed assistant text (no tool call markup).
      // When chat.cpp cannot give us a parsed view we fall back to the raw token.
      if (typeof data.content === 'string') {
        if (data.content.length <= streamed.length) return;
        const delta = data.content.startsWith(streamed) ? data.content.slice(streamed.length) : data.content;
        streamed = data.content;
        if (delta) callback(delta);
        return;
      }
      if (data.token) {
        streamed += data.token;
        callback(data.token);
      }
    }, signal);
    return this.toCompleteResponse(result);
  }

  /** Interrupts the in-flight generation, if any. */
  async stop(): Promise<void> {
    if (!this.context || !this.isGenerating) return;
    await this.context.stopCompletion();
  }

  async unloadModel(): Promise<void> {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (!this.context) return;
    this.log('Unloading model');
    const context = this.context;
    this.context = null;
    await context.release();
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up LlamaRnWrapper');
    await this.unloadModel();
  }
}
