import { initLlama, LlamaContext, NativeCompletionResult } from '@pocketpalai/llama.rn'
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Model } from '@/utils/types';
import { defaultModels } from '@/utils/models';
import { Platform } from 'react-native';
import { NativeLlamaChatMessage } from '@pocketpalai/llama.rn/lib/typescript/NativeRNLlama';
import { stops } from '@/utils/chat';

type IResponse = {
  textResponse: string;
  metrics: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    outputTps: number;
    duration: number;
  },
}

export default class LlamaRnWrapper {
  private model: string;
  private ggufFilePath: string | null = null;
  private llamaRnContext: LlamaContext | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveInterval = 1000 * 60 * 5;

  constructor({ model }: {model: string}) {
    this.model = model;
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  async determineGgufFilePath() {
    if(!this.ggufFilePath) {
      this.log(`GGUF file location is not yet set - getting from RNFS`);
      let path = `${RNFS.DocumentDirectoryPath}/models/gguf/${this.model}`;

      if(path.endsWith('.gguf')) {
        if(await RNFS.exists(path)) {
          this.ggufFilePath = path;
          this.log(`GGUF file found at ${this.ggufFilePath}`);
          return this.ggufFilePath;
        } else {
          this.log(`GGUF file not found at ${path} - trying to find via subdir`);
          path = path.split('/').slice(0, -1).join('/');
          this.log(`Retrying to find GGUF file in ${path}`);
        }
      }

      this.log(`Expected GGUF file path is ${path}`);
      const files = await RNFS.readDir(path);
      const ggufFile = files.find(file => file.name.endsWith('.gguf'));
      if(!ggufFile) throw new Error(`LlamaRnWrapper::ggufFilePath: No gguf file found for model ${this.model}`);
      this.ggufFilePath = `${path}/${ggufFile.name}`;
    }
    return this.ggufFilePath;
  }

  get name() {
    return 'llama.rn';
  }

  get modeDefinition(): Model {
    return defaultModels.find(model => model.id === this.model) as Model;
  }

  async initialize(): Promise<boolean> {
    try {
      if(!!this.llamaRnContext) {
        this.log(`Context already loaded - skipping`);
        return true;
      }

      if(!this.ggufFilePath) await this.determineGgufFilePath();
      if(!this.ggufFilePath) throw new Error(`LlamaRnWrapper::initialize: No gguf file found for model ${this.model}`);

      console.log({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.modeDefinition?.defaultCompletionSettings?.n_predict ?? 2048,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
      })

      this.llamaRnContext = await initLlama({
        model: this.ggufFilePath,
        use_mlock: true,
        n_ctx: this.modeDefinition?.defaultCompletionSettings?.n_predict ?? 2048,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        embedding: false,
      })

      this.log(`${this.name} initialized with model ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize model:', error);
      throw error;
    }
  }

  private keepAlive() {
    if(this.keepAliveTimer) this.log(`Keep alive timer already running - resetting timer for ${this.keepAliveInterval}ms`);
    else this.log(`Starting keep alive timer for ${this.keepAliveInterval}ms`);
    this.keepAliveTimer = setTimeout(() => {
      this.cleanup();
    }, this.keepAliveInterval);
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response
   */
  async getChatCompletion(messages: NativeLlamaChatMessage[]): Promise<IResponse> {
    this.keepAlive();
    if(!this.llamaRnContext) await this.initialize();
    if(!this.llamaRnContext) throw new Error(`LlamaRnWrapper::streamGetChatCompletion: Model not initialized`);

    const msgResult: NativeCompletionResult = await this.llamaRnContext.completion({
      messages: messages,
      n_predict: this.modeDefinition?.defaultCompletionSettings?.n_predict ?? 2048,
      stop: stops,
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
  async streamGetChatCompletion(messages: NativeLlamaChatMessage[], callback: (token: string) => void): Promise<IResponse> {
    this.keepAlive();
    if(!this.llamaRnContext) await this.initialize();
    if(!this.llamaRnContext) throw new Error(`LlamaRnWrapper::streamGetChatCompletion: Model not initialized`);

    const msgResult: NativeCompletionResult = await this.llamaRnContext.completion({
      messages: messages,
      n_predict: this.modeDefinition?.defaultCompletionSettings?.n_predict ?? 2048,
      stop: stops,
    },  (data: {token: string}) => {
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
    if(this.llamaRnContext) await this.llamaRnContext.release();
    this.llamaRnContext = null;
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up LlamaRnWrapper');
    await this.unloadModel();
  }
}