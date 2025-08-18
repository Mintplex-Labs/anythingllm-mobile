import BaseOpenAILikeProvider from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface LMStudioProviderConfig {
  provider: string;
  config?: {
    baseURL?: string;
    model?: string;
    apiKey?: string;
  }
}

export interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

function lmStudioBaseURLFormatter(baseURL?: string) {
  if (!baseURL) return '';
  try {
    const url = new URL(baseURL);
    url.pathname = '/v1';
    return url.href;
  } catch (error) {
    return baseURL;
  }
}

class LMStudioProvider extends BaseOpenAILikeProvider {
  private baseURL: string = '';
  private apiKey: string | null = null;
  public isExternalProvider: boolean = true;

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false; // always false for LMStudio

  constructor({ provider = 'lmstudio', config = {} }: LMStudioProviderConfig) {
    config.baseURL = lmStudioBaseURLFormatter(config.baseURL);
    super({ provider, config });

    // Random other properties we may or may not need
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }

    if (config.baseURL) this.baseURL = lmStudioBaseURLFormatter(config.baseURL);
    if (config.apiKey) this.apiKey = config.apiKey;
    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;

    this.client = new OpenAILite({
      ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    });
    this.log(`${this.connectionProvider} initialized with model ${this.model}`);
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  override async availableModels(): Promise<LMStudioModel[]> {
    return await this.client.models.list()
      .then((models) => models.data.map((model: LMStudioModel) => model))
      .catch((error) => {
        this.log(`Error fetching models: ${error}`);
        return [];
      });
  }

  async loadNewModel(model: string) {
    this.model = model;
  }

  /**
   * This is a stub method for compliance with the base class.
   * We don't need to unload the model here since that is not supported by this provider.
   */
  async unloadModel() {
    return;
  }
}

export default LMStudioProvider;