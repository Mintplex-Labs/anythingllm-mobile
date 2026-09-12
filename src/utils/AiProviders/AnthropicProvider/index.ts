import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import AnthropicLite from "@/utils/anthropic";

export interface AnthropicProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    model?: string;
  }
}

/**
 * Anthropic - uses the Messages API over REST via `AnthropicLite`, which presents the same
 * OpenAI-shaped client surface as `OpenAILite` so the base provider needs no special casing.
 */
class AnthropicProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private baseURL: string = 'https://api.anthropic.com/v1';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  // AnthropicLite is structurally compatible with the OpenAILite surface the base class uses.
  protected client: any;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'anthropic', config = {} }: AnthropicProviderConfig) {
    super({ provider, config });

    if (config.apiKey) this.apiKey = config.apiKey;
    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;

    this.client = new AnthropicLite({
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
      .then((models: { data: IAvailableModel[] }) => models.data)
      .catch((error: unknown) => {
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

export default AnthropicProvider;
