import { CompletionParams, initLlama, LlamaContext, NativeCompletionResult } from 'llama.rn'
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Model } from '@/utils/types';
import { defaultModels } from '@/utils/models';
import { Platform } from 'react-native';
import { NativeLlamaChatMessage } from 'llama.rn/lib/typescript/NativeRNLlama';
import { stops } from '@/utils/chat';
import { ICompleteResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import type OnDeviceProvider from '@/utils/AiProviders/onDevice/index';

export type ILlamaRnStreamCallback = (token: string) => void;
export default class LlamaRnWrapper {
  /**
   * Hardcoded default values for the LlamaRnWrapper class so everything is consistent when unset
   * https://github.com/mybigday/llama.rn/blob/b12219527d9d38d1915c1a69055e6a59db7f7cd1/android/src/main/java/com/rnllama/LlamaContext.java#L68
   */

  /** 
   * This is the default context length for the LlamaRnWrapper class, not the workspace settings.
   * On overflow, the chats are auto-truncated by the LlamaRnWrapper class. Maybe we can warn the user when
   * they are overflowing?
   */
  static DEFAULT_CONTEXT_LENGTH = 512;
  static DEFAULT_TEMPERATURE = 0.7;

  /**
   * This is -1 (no limit) in the LlamaRnWrapper class, but we definitely want to limit it on mobile
   * Once we implement a way to abort the stream & have it user-controlled via workspace settings, we can set this to -1 or a higher number
   */
  static DEFAULT_N_PREDICT = 2048;

  private parent: OnDeviceProvider;
  private model: string;
  private ggufFilePath: string | null = null;
  private llamaRnContext: LlamaContext | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveInterval = 1000 * 60 * 5;

  constructor({ model, parent }: { model: string; parent: OnDeviceProvider }) {
    this.model = model;
    this.parent = parent;
    this.presetGGUFFilePath();
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
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
      this.log(`GGUF file location is not yet set - will find a gguf file in the model directory.`);
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

  get name() {
    return 'llama.rn';
  }

  get modelDefinition(): Model {
    return defaultModels.find(model => model.id === this.model) as Model;
  }

  get temperature() {
    return this.parent.workspace?.temperature ?? LlamaRnWrapper.DEFAULT_TEMPERATURE;
  }

  get nPredict() {
    return LlamaRnWrapper.DEFAULT_N_PREDICT;
    // return this.parent.workspace?.nPredict ?? LlamaRnWrapper.DEFAULT_N_PREDICT;
  }

  get contextLength() {
    return this.parent.workspace?.contextLength ?? LlamaRnWrapper.DEFAULT_CONTEXT_LENGTH;
  }

  async initialize(): Promise<boolean> {
    try {
      if (!!this.llamaRnContext) {
        this.log(`Context already loaded - skipping`);
        return true;
      }

      if (!this.ggufFilePath) await this.determineGgufFilePath();
      if (!this.ggufFilePath) throw new Error(`LlamaRnWrapper::initialize: No gguf file found for model ${this.model}`);

      this.llamaRnContext = await initLlama({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.contextLength,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
      })

      this.log(`${this.name} initialized with model ${this.model} @ ${this.contextLength} context length`);
      return true;
    } catch (error) {
      console.error('Failed to initialize model:', error);
      throw error;
    }
  }

  /**
   * Parses the model runtime config from the model definition.
   * This is used to add extra params to the model runtime config that might be recommended by the model provider.
   * but are not directly user-configurable.
   * @returns The model runtime config.
   */
  private get defaultRuntimeConfig(): CompletionParams | {} {
    const extraParams: CompletionParams = {};
    if (!!this.modelDefinition) {
      if (this.modelDefinition.chatTemplateString) {
        extraParams.chat_template = this.modelDefinition.chatTemplateString;
      }

      if (this.modelDefinition.completionSettings)
        for (const [key, value] of Object.entries(this.modelDefinition.completionSettings)) {
          extraParams[key] = value;
        }
    }
    return extraParams;
  }

  private keepAlive() {
    if (this.keepAliveTimer) this.log(`Keep alive timer already running - resetting timer for ${this.keepAliveInterval}ms`);
    else this.log(`Starting keep alive timer for ${this.keepAliveInterval}ms`);
    this.keepAliveTimer = setTimeout(() => {
      this.cleanup();
    }, this.keepAliveInterval);
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response
   */
  async getChatCompletion(messages: NativeLlamaChatMessage[]): Promise<ICompleteResponse> {
    this.keepAlive();
    if (!this.llamaRnContext) await this.initialize();
    if (!this.llamaRnContext) throw new Error(`LlamaRnWrapper::streamGetChatCompletion: Model not initialized`);

    const msgResult: NativeCompletionResult = await this.llamaRnContext.completion({
      messages: messages,
      n_predict: this.nPredict,
      stop: stops,
      ...this.defaultRuntimeConfig,
      temperature: this.temperature,
    });

    return {
      textResponse: msgResult.content,
      metrics: {
        prompt_tokens: msgResult.timings.prompt_n,
        completion_tokens: msgResult.timings.predicted_n,
        total_tokens: msgResult.timings.prompt_n + msgResult.timings.predicted_n,
        outputTps: msgResult.timings.predicted_per_second,
        duration: msgResult.timings.predicted_ms,
      },
    };
  }

  /**
   * Streams the chat completion from the model.
   */
  async streamGetChatCompletion(messages: NativeLlamaChatMessage[], callback: ILlamaRnStreamCallback): Promise<ICompleteResponse> {
    this.keepAlive();
    if (!this.llamaRnContext) await this.initialize();
    if (!this.llamaRnContext) throw new Error(`LlamaRnWrapper::streamGetChatCompletion: Model not initialized`);

    this.log(`default params: ${JSON.stringify(this.defaultRuntimeConfig)}`);

    const msgResult: NativeCompletionResult = await this.llamaRnContext.completion({
      messages: messages,
      n_predict: this.nPredict,
      stop: stops,
      ...this.defaultRuntimeConfig,
      temperature: this.temperature, // workspace temperature overrides any model-specific settings
    }, (data: { token: string }) => {
      const { token } = data;
      callback(token);
    });

    return {
      textResponse: msgResult.content,
      metrics: {
        prompt_tokens: msgResult.timings.prompt_n,
        completion_tokens: msgResult.timings.predicted_n,
        total_tokens: msgResult.timings.prompt_n + msgResult.timings.predicted_n,
        outputTps: msgResult.timings.predicted_per_second,
        duration: msgResult.timings.predicted_ms,
      },
    };
  }

  async unloadModel(): Promise<void> {
    this.log('Unloading model');
    if (this.llamaRnContext) await this.llamaRnContext.release();
    this.llamaRnContext = null;
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up LlamaRnWrapper');
    await this.unloadModel();
  }
}