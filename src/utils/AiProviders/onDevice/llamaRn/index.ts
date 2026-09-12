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
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { stops } from '@/utils/chat';
import { ICompleteResponse } from '@/utils/AiProviders/baseOpenAILikeProvider';
import type OnDeviceProvider from '@/utils/AiProviders/onDevice/index';
import { getDefaultContextLength } from '@/utils/contextLength';
import ContextCompactor, { type CompactionChatMessage, truncateMiddle } from '@/utils/chat/contextCompaction';
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
  /** True when the mmproj projector is loaded and llama.cpp reports vision support for it. */
  supportsVision: boolean;
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
   * Context length default is shared with `Workspace` so inference behaves the same when a workspace has no override.
   * Keeping inside the window, in order:
   *  1. `OnDeviceProvider.shapePrompt` swaps the oldest chats for a rolling summary (`compactor`) and caps RAG chunks.
   *  2. `fitMessagesToContext` drops the oldest remaining turns, then shrinks the latest message if it alone overflows.
   *  3. `runCompletion` sizes `n_predict` to the room actually left so the reply ends cleanly instead of shifting.
   *  4. llama.cpp context shifting stays on as a last line of defence.
   */
  /** Scales with device RAM up to a max of 2048 - see src/utils/contextLength.ts */
  static get DEFAULT_CONTEXT_LENGTH(): number {
    return getDefaultContextLength();
  }
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

  /** Tokens left unused between prompt and reply for template/BOS slack when sizing `n_predict`. */
  static CONTEXT_SAFETY_MARGIN = 16;
  /** Smallest reply we ask for once the prompt has crowded the window. Below this, context shifting takes over. */
  static MIN_N_PREDICT = 64;
  /** A message is never truncated below this many characters by `fitMessagesToContext`. */
  static MIN_TRUNCATED_MESSAGE_CHARS = 200;
  /** Share of the prompt budget RAG chunks may occupy - they live in the system prompt which pruning cannot touch. */
  static CONTEXT_TEXTS_BUDGET_RATIO = 0.35;
  /** Share of the prompt budget a single tool result may occupy. */
  static TOOL_RESULT_BUDGET_RATIO = 0.25;
  /** Rough English chars-per-token used to turn token budgets into character caps. */
  static CHARS_PER_TOKEN = 3.5;
  /**
   * Cap on the tokens one image may occupy in the prompt. Phones run a 1-2k token window, so a
   * photo must leave room for the system prompt, history and the reply. Images are also downscaled
   * before they reach us (see `useAttachments`), this is the backstop inside llama.cpp.
   */
  static IMAGE_MAX_TOKENS = 512;

  private parent: OnDeviceProvider;
  private model: string;
  private ggufFilePath: string | null = null;
  private context: LlamaContext | null = null;
  /** Serialises everything that touches `context.completion` - llama.rn owns one context and cannot run two completions at once. */
  private completionQueue: Promise<unknown> = Promise.resolve();
  private _compactor: { contextLength: number; instance: ContextCompactor } | null = null;
  private initializing: Promise<boolean> | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInterval = 1000 * 60 * 5;
  private isGenerating = false;
  /** Set once `initMultimodal` succeeded on the live context and llama.cpp confirmed vision support. */
  private visionEnabled = false;
  /** Set by `requestReload` while a generation is running - honoured before the next completion. */
  private reloadRequested = false;

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

  /** Where the model's mmproj file lives once downloaded (null when the model has no projector). */
  get mmprojFilePath(): string | null {
    return LlamaRnWrapper.mmprojFilePathFor(this.modelDefinition);
  }

  static mmprojFilePathFor(model: Model | undefined): string | null {
    if (!model?.mmproj?.downloadUrl) return null;
    return resolveDestinationPathFromGGUFUrl(model.mmproj.downloadUrl);
  }

  /**
   * Whether a catalog model can take image input right now: it must be flagged with the `vision`
   * capability AND its mmproj projector must already be on disk. Anything else (imported/unknown
   * models, projector not downloaded) is a hard no - we never guess about on-device vision.
   */
  static async modelSupportsVision(modelId: string | null | undefined): Promise<boolean> {
    if (!modelId) return false;
    const definition = defaultModels.find(model => model.id === modelId) as Model | undefined;
    if (!definition?.capabilities?.includes('vision')) return false;
    const mmprojPath = LlamaRnWrapper.mmprojFilePathFor(definition);
    if (!mmprojPath) return false;
    return RNFS.exists(mmprojPath).catch(() => false);
  }

  /** True while the loaded context has a working vision projector. */
  get supportsVision(): boolean {
    return this.visionEnabled;
  }

  /**
   * Drops the loaded context so the next completion rebuilds it - used when the vision projector
   * finishes downloading while the model is already loaded text-only. Never interrupts a running
   * generation: in that case the reload happens right before the next prompt.
   */
  requestReload() {
    if (!this.context) return;
    if (this.isGenerating) {
      this.reloadRequested = true;
      return;
    }
    this.log('Reload requested - unloading so the next prompt picks up the new configuration');
    this.unloadModel().catch((e) => this.log('Failed to unload for reload', e));
  }

  /**
   * Workspace temperature override, or `null` to defer to the model definition's
   * `completionSettings.temperature` and finally llama.rn's own default (0.8, `common_params_sampling::temp`).
   */
  get temperature(): number | null {
    return this.parent.workspace?.temperature ?? null;
  }

  get nPredict() {
    return LlamaRnWrapper.DEFAULT_N_PREDICT;
  }

  get contextLength() {
    return this.parent.workspace?.contextLength ?? LlamaRnWrapper.DEFAULT_CONTEXT_LENGTH;
  }

  /** Tokens kept free for the reply when fitting the prompt. */
  get responseReserve(): number {
    return Math.min(this.nPredict, Math.max(128, Math.floor(this.contextLength * LlamaRnWrapper.RESPONSE_RESERVE_RATIO)));
  }

  /** Tokens the rendered prompt (system + summary + RAG + history + user message) may occupy. */
  get promptBudget(): number {
    return Math.max(64, this.contextLength - this.responseReserve);
  }

  /** Character cap applied to each tool result before it is fed back to the model. */
  get maxToolResultChars(): number {
    return Math.floor(this.promptBudget * LlamaRnWrapper.TOOL_RESULT_BUDGET_RATIO * LlamaRnWrapper.CHARS_PER_TOKEN);
  }

  /** Token budget shared by all RAG chunks in one prompt. */
  get contextTextsTokenBudget(): number {
    return Math.floor(this.promptBudget * LlamaRnWrapper.CONTEXT_TEXTS_BUDGET_RATIO);
  }

  /**
   * Rolling-summary compactor bound to this model's window and tokenizer. Rebuilt when the
   * workspace context length changes so its budgets stay in step.
   */
  get compactor(): ContextCompactor {
    if (!this._compactor || this._compactor.contextLength !== this.contextLength) {
      this._compactor = {
        contextLength: this.contextLength,
        instance: new ContextCompactor({
          contextWindow: this.contextLength,
          promptBudget: this.promptBudget,
          countTokens: (messages) => this.countTokens(messages),
          complete: (messages, { maxTokens }) => this.completeUtility(messages, maxTokens),
          log: (message, ...args) => this.log(message, ...args),
        }),
      };
    }
    return this._compactor.instance;
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
      supportsVision: this.visionEnabled,
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
        const mmprojPath = await this.availableMmprojPath();
        this.context = await this.createContext({ multimodal: !!mmprojPath });
        if (mmprojPath) {
          this.visionEnabled = await this.attachMultimodal(this.context, mmprojPath);
          if (!this.visionEnabled) {
            // A text-only context must keep ctx_shift on (see createContext) - rebuild it without the projector.
            this.log('Vision projector could not be loaded - falling back to a text-only context');
            await this.context.release();
            this.context = await this.createContext({ multimodal: false });
          }
        }
        this.log(`${this.name} initialized`, {
          devices: this.context.devices,
          nativeToolCalling: this.supportsNativeToolCalling,
          jinja: this.context.isJinjaSupported(),
          vision: this.visionEnabled,
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

  /** The mmproj path for this model if the file has been downloaded, otherwise null. */
  private async availableMmprojPath(): Promise<string | null> {
    const path = this.mmprojFilePath;
    if (!path) return null;
    if (await RNFS.exists(path)) return path;
    this.log(`Model declares a vision projector but ${path} is not downloaded - loading text-only`);
    return null;
  }

  /**
   * Loads the mmproj projector into the context and confirms llama.cpp sees vision support.
   * Never throws - a failed projector just means the model runs text-only.
   * https://github.com/mybigday/llama.rn#multimodal-vision--audio
   */
  private async attachMultimodal(context: LlamaContext, mmprojPath: string): Promise<boolean> {
    try {
      const ok = await context.initMultimodal({
        path: mmprojPath,
        // CPU only, same as the text model - see createContext.
        use_gpu: false,
        image_max_tokens: LlamaRnWrapper.IMAGE_MAX_TOKENS,
      });
      if (!ok) return false;
      const support = await context.getMultimodalSupport();
      if (!support.vision) {
        this.log('Projector loaded but reports no vision support - releasing it');
        await context.releaseMultimodal().catch(() => { });
        return false;
      }
      this.log(`Vision projector loaded from ${mmprojPath}`);
      return true;
    } catch (error) {
      this.log('Failed to load vision projector', error);
      return false;
    }
  }

  private async createContext({ multimodal }: { multimodal: boolean }) {
    const nCtx = this.contextLength;
    return initLlama({
      model: this.ggufFilePath!,
      n_ctx: nCtx,
      n_batch: Math.min(LlamaRnWrapper.N_BATCH, nCtx),
      n_ubatch: Math.min(LlamaRnWrapper.N_BATCH, nCtx),
      use_mlock: true,
      use_mmap: true,
      // Shift the KV cache instead of failing if a long answer runs past the window.
      // llama.rn requires shifting OFF for multimodal contexts so media token positions stay put;
      // `runCompletion` already sizes n_predict to the room left so this rarely matters in practice.
      ctx_shift: !multimodal,
      // CPU only. The Hexagon NPU / OpenCL backends in llama.cpp are experimental and slower
      // than the CPU path on the phones we target, so we never offload layers.
      n_gpu_layers: 0,
      ...(this.modelDefinition?.chatTemplateString ? { chat_template: this.modelDefinition.chatTemplateString } : {}),
    });
  }

  /**
   * Sampling params recommended by the model author (from the model definition) that
   * are not user configurable, plus the workspace temperature which wins when it is set.
   * When the workspace temperature is `null` the key is left as the model author's value,
   * or omitted entirely so llama.rn falls back to its native default.
   */
  private get completionParams(): Partial<CompletionParams> {
    const params: Record<string, any> = {};
    if (this.modelDefinition?.completionSettings) {
      for (const [key, value] of Object.entries(this.modelDefinition.completionSettings)) params[key] = value;
    }
    if (this.temperature !== null) params.temperature = this.temperature;
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
    // Images are rendered as a `<__media__>` marker which tokenizes as a few text tokens, so budget each
    // one at the cap handed to the projector instead. Over-estimating only shrinks n_predict a little;
    // under-estimating would overflow a multimodal context, which cannot shift (see createContext).
    const mediaCount = (formatted as { media_paths?: string[] }).media_paths?.length ?? 0;
    return tokens.length + mediaCount * LlamaRnWrapper.IMAGE_MAX_TOKENS;
  }

  /** Tokens `messages` render to through the model's chat template. Loads the model if needed. */
  async countTokens(messages: CompactionChatMessage[]): Promise<number> {
    if (!this.context) await this.initialize();
    return this.countPromptTokens(messages as any);
  }

  private async countText(text: string): Promise<number> {
    if (!this.context) await this.initialize();
    if (!this.context) throw new Error('LlamaRnWrapper::countText: Model not initialized');
    const { tokens } = await this.context.tokenize(text);
    return tokens.length;
  }

  /**
   * Keeps RAG chunks inside their share of the prompt budget. Whole chunks are kept in
   * relevance order; the first one that does not fit is cut to the remaining room and the rest dropped.
   */
  async fitContextTexts(contextTexts: string[]): Promise<string[]> {
    if (!contextTexts.length) return contextTexts;
    const budget = this.contextTextsTokenBudget;
    const kept: string[] = [];
    let used = 0;
    for (const text of contextTexts) {
      const tokens = await this.countText(text);
      if (used + tokens <= budget) {
        kept.push(text);
        used += tokens;
        continue;
      }
      const remaining = budget - used;
      if (remaining >= 48) kept.push(`${text.slice(0, Math.floor(remaining * LlamaRnWrapper.CHARS_PER_TOKEN))}...`);
      break;
    }
    if (kept.length !== contextTexts.length || kept.some((text, i) => text !== contextTexts[i])) {
      this.log(`Fitted ${contextTexts.length} context chunk(s) into a ${budget} token budget - kept ${kept.length}`);
    }
    return kept;
  }

  /**
   * One-off, tool-free completion for housekeeping (eg: context summaries). Queued behind
   * any running generation and never aborted by the user's stop button.
   */
  async completeUtility(messages: CompactionChatMessage[], maxTokens: number): Promise<string> {
    const result = await this.runCompletion(messages as any, [], undefined, null, { nPredict: maxTokens });
    return result.content ?? result.text ?? '';
  }

  /**
   * Drops the oldest chat turns until the rendered prompt leaves room for a response.
   * The system prompt (index 0) and the latest user message are always kept.
   * Returns the (possibly trimmed) messages and how many tokens they render to.
   */
  async fitMessagesToContext(messages: NativeLlamaChatMessage[], tools?: any[]): Promise<{ messages: NativeLlamaChatMessage[]; promptTokens: number; dropped: number }> {
    const nCtx = this.contextLength;
    const budget = this.promptBudget;

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
    // Nothing left to drop but still over budget: the latest message itself (a long prompt, or a
    // user message with tool results merged in) is the culprit. Shrink it rather than let
    // llama.cpp's context shift evict the system prompt mid-generation.
    if (promptTokens > budget) {
      const lastIndex = working.length - 1;
      const original = working[lastIndex];
      const content = typeof original?.content === 'string' ? original.content : null;
      if (content && content.length > LlamaRnWrapper.MIN_TRUNCATED_MESSAGE_CHARS) {
        let maxChars = Math.floor(content.length * 0.75);
        while (promptTokens > budget && maxChars >= LlamaRnWrapper.MIN_TRUNCATED_MESSAGE_CHARS) {
          working[lastIndex] = { ...original, content: truncateMiddle(content, maxChars) } as NativeLlamaChatMessage;
          promptTokens = await this.countPromptTokens(working, tools);
          maxChars = Math.floor(maxChars * 0.75);
        }
        this.log(`Truncated the latest message from ${content.length} to ${String(working[lastIndex].content).length} chars to fit the ${budget} token budget (prompt now ${promptTokens} tokens)`);
      }
      if (promptTokens > budget) this.log(`Prompt is ${promptTokens} tokens which exceeds the ${budget} token budget even after trimming - relying on context shifting.`);
    }
    return { messages: working, promptTokens, dropped };
  }

  private toCompleteResponse(result: NativeCompletionResult & { cappedByContext?: boolean }): ICompleteResponse {
    // Either llama.cpp filled the window, or we shrank n_predict to the remaining room and the model used all of it.
    const truncatedByContext = !!result.context_full || (!!result.cappedByContext && !!result.stopped_limit && !result.stopped_eos && !result.stopped_word);
    if (truncatedByContext) this.log('Reply hit the context window limit and was cut short. Consider raising the workspace context length.');
    if (result.truncated) this.log('Prompt was truncated by llama.cpp to fit the context window.');
    return {
      // `content` has reasoning/tool call markup already parsed out by chat.cpp; `text` is the raw output.
      textResponse: result.content ?? result.text ?? '',
      truncatedByContext,
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

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.completionQueue.catch(() => null).then(task);
    this.completionQueue = run.catch(() => null);
    return run;
  }

  /**
   * One llama.rn round. Rounds are queued so a background context summary and the user's
   * next prompt never hit the single native context at the same time.
   */
  private runCompletion(
    messages: NativeLlamaChatMessage[],
    availableTools: any[] = [],
    onToken?: (data: TokenData) => void,
    signal?: AbortSignal | null,
    options: { nPredict?: number } = {},
  ): Promise<NativeCompletionResult & { cappedByContext: boolean }> {
    return this.runExclusive(() => this.runCompletionUnlocked(messages, availableTools, onToken, signal, options));
  }

  private async runCompletionUnlocked(
    messages: NativeLlamaChatMessage[],
    availableTools: any[],
    onToken: ((data: TokenData) => void) | undefined,
    signal: AbortSignal | null | undefined,
    options: { nPredict?: number },
  ): Promise<NativeCompletionResult & { cappedByContext: boolean }> {
    this.keepAlive();
    throwIfAborted(signal); // may have been stopped while queued behind another round
    if (this.reloadRequested) {
      this.reloadRequested = false;
      await this.unloadModel();
    }
    if (!this.context) await this.initialize();
    if (!this.context) throw new Error('LlamaRnWrapper::runCompletion: Model not initialized');

    const useTools = this.supportsNativeToolCalling && availableTools.length > 0;
    if (availableTools.length && !useTools) this.log(`Model template has no tool support - ${availableTools.length} tool(s) will not be offered.`);

    const tools = useTools ? availableTools : undefined;
    const { messages: fitted, promptTokens } = await this.fitMessagesToContext(this.dropUnsupportedMedia(messages), tools);

    // Ask for no more tokens than the window has left so the reply ends cleanly (stopped_limit)
    // instead of llama.cpp shifting the KV cache and evicting the start of the prompt.
    const requestedPredict = options.nPredict ?? this.nPredict;
    const room = this.contextLength - promptTokens - LlamaRnWrapper.CONTEXT_SAFETY_MARGIN;
    const nPredict = Math.max(LlamaRnWrapper.MIN_N_PREDICT, Math.min(requestedPredict, room));
    const cappedByContext = nPredict < requestedPredict;
    if (cappedByContext) this.log(`Reply capped at ${nPredict} tokens - prompt uses ${promptTokens} of the ${this.contextLength} token window`);

    // The user may have stopped while the model was loading or the prompt was being fitted -
    // never start generating in that case. Once generating, an abort interrupts the native loop.
    throwIfAborted(signal);
    const onAbort = () => { this.stop().catch((e) => this.log('Failed to stop generation on abort', e)); };
    signal?.addEventListener('abort', onAbort, { once: true });

    this.isGenerating = true;
    try {
      const result = await this.context.completion(
        {
          messages: fitted as any,
          n_predict: nPredict,
          stop: [...stops],
          jinja: this.context.isJinjaSupported(),
          // Keep <think> blocks inline - the chat UI already extracts them into the thought chain.
          reasoning_format: 'none',
          ...(useTools ? { tools, tool_choice: 'auto' } : {}),
          ...this.completionParams,
        },
        onToken,
      );
      return { ...result, cappedByContext };
    } finally {
      this.isGenerating = false;
      signal?.removeEventListener('abort', onAbort);
      this.keepAlive();
    }
  }

  /**
   * Without a loaded projector llama.rn cannot tokenize `image_url` parts, so flatten any structured
   * content back to its text. Only reachable when a chat with images is retried after switching to a
   * text-only model - the UI never offers images unless `modelSupportsVision` is true.
   */
  private dropUnsupportedMedia(messages: NativeLlamaChatMessage[]): NativeLlamaChatMessage[] {
    if (this.visionEnabled) return messages;
    let dropped = 0;
    const cleaned = messages.map((message) => {
      if (!Array.isArray(message.content)) return message;
      const parts = message.content as any[];
      const textParts = parts.filter((part) => part?.type === 'text');
      dropped += parts.length - textParts.length;
      return { ...message, content: textParts.map((part) => String(part.text ?? '')).join('\n') };
    });
    if (dropped) this.log(`Dropped ${dropped} media part(s) - this context has no vision projector loaded`);
    return cleaned;
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
    if (this.visionEnabled) {
      this.visionEnabled = false;
      await context.releaseMultimodal().catch((e) => this.log('Failed to release vision projector', e));
    }
    await context.release();
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up LlamaRnWrapper');
    await this.unloadModel();
  }
}
