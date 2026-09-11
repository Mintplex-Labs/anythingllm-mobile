import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface TogetherAIProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    model?: string;
  }
}

/**
 * TogetherAI - hosted OpenAI-compatible API. Only the API key and model are configurable.
 */
class TogetherAIProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private baseURL: string = 'https://api.together.xyz/v1';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'togetherai', config = {} }: TogetherAIProviderConfig) {
    super({ provider, config });

    if (config.apiKey) this.apiKey = config.apiKey;
    this.model = config.model || 'Unknown Model';
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

  override async availableModels(): Promise<IAvailableModel[]> {
    return await this.client.models.list()
      .then((models) => models.data
        // Together lists image/embedding/rerank models too - only chat models can be used here.
        .filter((model: IAvailableModel & { type?: string }) => !model.type || model.type === 'chat'))
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

export default TogetherAIProvider;
