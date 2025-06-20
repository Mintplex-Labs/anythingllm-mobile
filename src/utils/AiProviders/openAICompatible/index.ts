import BaseOpenAILikeProvider from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface OpenAICompatibleConfig {
  provider: string;
  config?: {
    baseURL?: string;
    apiKey?: string;
    modelId?: string;
    isOTypeModel?: boolean;
  }
}

class OpenAICompatible extends BaseOpenAILikeProvider {
  private baseURL: string = 'https://api.openai.com/v1';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  protected client;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'OpenAICompatible', config = {} }: OpenAICompatibleConfig) {
    super({ provider, config });

    // Random other properties we may or may not need
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }

    if (config.baseURL) this.baseURL = config.baseURL;
    if (config.apiKey) this.apiKey = config.apiKey;
    this.model = config.modelId || 'Unknown Model';
    this.connectionProvider = provider;

    this.client = new OpenAILite({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
    this.log(`${this.connectionProvider} initialized with model ${this.model}`);
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  availableModels() {
    return [];
  }

  async loadNewModel(model: string) {
    this.model = model;
  }
}

export default OpenAICompatible;