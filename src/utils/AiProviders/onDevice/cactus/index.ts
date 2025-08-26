import { CompletionParams, CactusLM } from 'cactus-react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import { Model } from '@/utils/types';
import { defaultModels } from '@/utils/models';
import { Platform } from 'react-native';
import { stops } from '@/utils/chat';
import { ICompleteResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import type OnDeviceProvider from '@/utils/AiProviders/onDevice/index';

export type NativeLlamaChatMessage = {
  role: string
  content: string
}

export type ICactusLmStreamCallback = (token: string) => void;
export default class CactusLmWrapper {
  /**
   * Hardcoded default values for the CactusLmWrapper class so everything is consistent when unset
   * https://github.com/cactus-compute/cactus/tree/main/react/src/NativeCactus.ts#L10
   */

  /** 
   * This is the default context length for the CactusLmWrapper class, not the workspace settings.
   * On overflow, the chats are auto-truncated by the CactusLmWrapper class. Maybe we can warn the user when
   * they are overflowing?
   */
  static DEFAULT_CONTEXT_LENGTH = 1024;
  static DEFAULT_TEMPERATURE = 0.7;

  /**
   * This is -1 (no limit) in the CactusLmWrapper class, but we definitely want to limit it on mobile
   * Once we implement a way to abort the stream & have it user-controlled via workspace settings, we can set this to -1 or a higher number
   */
  static DEFAULT_N_PREDICT = 2048;

  private parent: OnDeviceProvider;
  private model: string;
  private ggufFilePath: string | null = null;
  private cactusLmContext: CactusLM | null = null;
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
    return 'cactus.lm';
  }

  get modelDefinition(): Model {
    return defaultModels.find(model => model.id === this.model) as Model;
  }

  get temperature() {
    return this.parent.workspace?.temperature ?? CactusLmWrapper.DEFAULT_TEMPERATURE;
  }

  get nPredict() {
    return CactusLmWrapper.DEFAULT_N_PREDICT;
    // return this.parent.workspace?.nPredict ?? CactusLmWrapper.DEFAULT_N_PREDICT;
  }

  get contextLength() {
    return this.parent.workspace?.contextLength ?? CactusLmWrapper.DEFAULT_CONTEXT_LENGTH;
  }

  async initialize(): Promise<boolean> {
    try {
      if (!!this.cactusLmContext) {
        this.log(`Context already loaded - skipping`);
        return true;
      }

      if (!this.ggufFilePath) await this.determineGgufFilePath();
      if (!this.ggufFilePath) throw new Error(`CactusLmWrapper::initialize: No gguf file found for model ${this.model}`);

      const { lm, error } = await CactusLM.init({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.contextLength,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
      });

      if (error) throw error;
      this.cactusLmContext = lm;
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
    if (!this.cactusLmContext) await this.initialize();
    if (!this.cactusLmContext) throw new Error(`CactusLmWrapper::streamGetChatCompletion: Model not initialized`);

    const msgResult = await this.cactusLmContext.completion(
      messages,
      {
        stop: [...stops],
        n_predict: this.nPredict,
        ...this.defaultRuntimeConfig as any,
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
  async streamGetChatCompletion(
    messages: NativeLlamaChatMessage[],
    callback: ICactusLmStreamCallback,
    availableTools: any[],
  ): Promise<ICompleteResponse> {
    this.keepAlive();
    if (!this.cactusLmContext) await this.initialize();
    if (!this.cactusLmContext) throw new Error(`CactusLmWrapper::streamGetChatCompletion: Model not initialized`);

    const msgResult = await this.cactusLmContext.completion(
      messages,
      {
        stop: [...stops],
        n_predict: this.nPredict,
        tools: availableTools,
        tool_choice: 'auto',
        jinja: this.cactusLmContext.isJinjaSupported(),
        ...this.defaultRuntimeConfig as any,
        temperature: this.temperature,
      }, ({ token }: { token: string }) => {
        callback(token);
      });

    return {
      textResponse: msgResult.content,
      toolCalls: msgResult.tool_calls,
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
    if (this.cactusLmContext) await this.cactusLmContext.release();
    this.cactusLmContext = null;
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up CactusLmWrapper');
    await this.unloadModel();
  }
}