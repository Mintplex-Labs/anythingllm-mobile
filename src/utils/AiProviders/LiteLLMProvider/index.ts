import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface LiteLLMProviderConfig {
  provider: string;
  config?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  }
}

/**
 * LiteLLM - self-hosted OpenAI-compatible server. The user supplies the base URL; the API key is optional.
 */
class LiteLLMProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private baseURL: string = '';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'litellm', config = {} }: LiteLLMProviderConfig) {
    super({ provider, config });

    if (config.baseURL) this.baseURL = config.baseURL;
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

  override async availableModels(): Promise<IAvailableModel[]> {
    return await this.client.models.list()
      .then((models) => models.data)
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

export default LiteLLMProvider;
