import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface GeminiProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    model?: string;
  }
}

/**
 * Gemini - hosted OpenAI-compatible API. Only the API key and model are configurable.
 */
class GeminiProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private baseURL: string = 'https://generativelanguage.googleapis.com/v1beta/openai';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'gemini', config = {} }: GeminiProviderConfig) {
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

  /**
   * One tool per round is executed, so parallel calls would leave Gemini with a call/result count
   * mismatch and a 400 on the next request - same flag the desktop provider sends.
   */
  protected override extraRequestParams(hasTools: boolean = false): Record<string, any> {
    return hasTools ? { parallel_tool_calls: false } : {};
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  override async availableModels(): Promise<IAvailableModel[]> {
    return await this.client.models.list()
      .then((models) => models.data
        // The OpenAI-compatible listing prefixes ids with `models/` and includes embedding/image models.
        .map((model: IAvailableModel) => ({ ...model, id: model.id.replace(/^models\//, '') }))
        .filter((model: IAvailableModel) => /^(gemini|gemma)/i.test(model.id)))
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

export default GeminiProvider;
