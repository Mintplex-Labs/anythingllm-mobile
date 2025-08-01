import { applyTemplate } from "chat-formatter";
import { defaultModels } from '@/utils/models';
import TokenManager from '@/utils/tiktoken';
import { NPUEnabledModel } from '@/utils/types';
import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';
import { NativeLlamaChatMessage } from '@/utils/AiProviders/onDevice/cactus';
import { ICompleteResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import type OnDeviceProvider from '@/utils/AiProviders/onDevice/index';

interface KotlinGenieModuleInterface {
  loadModel(modelFolderName: string): Promise<number>;
  generateResponse(modelFolderName: string, prompt: string): Promise<void>;
  addListener(eventType: string): EmitterSubscription;
  removeListeners(count: number): void;
  unloadModel(): Promise<void>;
  ping(): Promise<string>;
}

export type IGenieStreamCallback = (token: string) => void;
const { GenieModule } = NativeModules as { GenieModule: KotlinGenieModuleInterface };

export default class GenieWrapper {
  private eventEmitter: NativeEventEmitter;
  private tokenListener: EmitterSubscription | null;
  public model: string;
  public genieWrapperHandle: number | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveInterval = 1000 * 60 * 5;
  private parent: OnDeviceProvider;

  constructor({ model, parent }: { model: string; parent: OnDeviceProvider }) {
    this.eventEmitter = new NativeEventEmitter(GenieModule);
    this.tokenListener = null;
    this.model = model;
    this.parent = parent;
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  get name() {
    return 'genie';
  }

  get modelDefinition(): NPUEnabledModel {
    return defaultModels.find(model => model.id === this.model) as NPUEnabledModel;
  }

  async ping(): Promise<string> {
    try {
      const result = await GenieModule.ping();
      return result;
    } catch (error) {
      console.error('Failed to ping:', error);
      throw error;
    }
  }

  async loadModel(): Promise<boolean> {
    try {
      this.genieWrapperHandle = await GenieModule.loadModel(this.model);
      this.log(`${this.name} initialized with model ${this.model}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize model:', error);
      throw error;
    }
  }

  private keepAlive() {
    this.log(`Model auto-unloading is disabled to to QNN corruption issues - stubbing for now`);
    // if(this.keepAliveTimer) this.log(`Keep alive timer already running - resetting timer for ${this.keepAliveInterval}ms`);
    // else this.log(`Starting keep alive timer for ${this.keepAliveInterval}ms`);
    // this.keepAliveTimer = setTimeout(() => {
    //   this.cleanup();
    // }, this.keepAliveInterval);
  }

  defaultSystemMessage() {
    return 'You are a helpful assistant that can answer questions and help with tasks.';
  }

  get chatTemplate() {
    const chatTemplate = this.modelDefinition.chatTemplate;
    chatTemplate.systemPrompt = this.defaultSystemMessage();
    return chatTemplate;
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response
   */
  async getChatCompletion(messages: NativeLlamaChatMessage[]): Promise<ICompleteResponse> {
    const formattedChat = applyTemplate(messages, {
      customTemplate: this.chatTemplate,
      addGenerationPrompt: true,
    }) as string;


    this.keepAlive();
    const startTime = Date.now();
    let accumulator = '';
    this.tokenListener = this.eventEmitter.addListener(
      'onTokenGenerated',
      (event: { token: string }) => accumulator += event.token
    );

    await GenieModule.generateResponse(this.model, formattedChat);
    this.tokenListener.remove();

    const duration = Date.now() - startTime;
    const tokenizer = new TokenManager(this.model);
    const prompt_tokens = tokenizer.countFromString(formattedChat);
    const completion_tokens = tokenizer.countFromString(accumulator);
    return {
      textResponse: accumulator,
      metrics: {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
        outputTps: completion_tokens / duration,
        duration,
      },
    };
  }

  /**
   * Streams the chat completion from the model.
   */
  async streamGetChatCompletion(messages: NativeLlamaChatMessage[], callback: IGenieStreamCallback): Promise<ICompleteResponse> {
    const formattedChat = applyTemplate(messages, {
      customTemplate: this.chatTemplate,
      addGenerationPrompt: true,
    }) as string;

    this.keepAlive();
    if (!callback) throw new Error('callback is required');
    if (this.tokenListener) this.tokenListener.remove();

    // Set up new listener
    let accumulator = '';
    this.tokenListener = this.eventEmitter.addListener(
      'onTokenGenerated',
      (event: { token: string }) => {
        callback(event.token);
        accumulator += event.token;
      }
    );

    try {
      const startTime = Date.now();
      await GenieModule.generateResponse(this.model, formattedChat);

      const duration = Date.now() - startTime;
      const tokenizer = new TokenManager(this.model);
      const prompt_tokens = tokenizer.countFromString(formattedChat);
      const completion_tokens = tokenizer.countFromString(accumulator);

      return {
        textResponse: accumulator,
        metrics: {
          prompt_tokens,
          completion_tokens,
          total_tokens: prompt_tokens + completion_tokens,
          outputTps: completion_tokens / duration,
          duration,
        },
      };
    } catch (error) {
      console.error('Failed to generate response:', error);
      throw error;
    } finally {
      this.tokenListener.remove();
    }
  }

  async unloadModel(): Promise<void> {
    this.log('Unloading model');
    return await GenieModule.unloadModel();
  }

  async cleanup(): Promise<void> {
    this.log('Cleaning up GenieWrapper');
    await this.unloadModel();
    if (this.tokenListener) {
      this.tokenListener.remove();
      this.tokenListener = null;
    }
  }
}