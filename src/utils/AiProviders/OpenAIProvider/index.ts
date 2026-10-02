import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import ResponsesLite from "@/utils/openaiResponses";

export interface OpenAIProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    model?: string;
  }
}

/**
 * OpenAI (API key) - uses the Responses API via `ResponsesLite`, which presents the same OpenAI-shaped client
 * surface as `OpenAILite`. Newer models (eg: GPT-6 Astra) only support tool calling on `/responses` and answer
 * 400 on `/chat/completions`, which every cloud chat hits since tools are always offered.
 * OpenAI-compatible servers stay on Chat Completions (`OpenAICompatible`) - few of them implement `/responses`.
 */
class OpenAIProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;

  public model: string;
  private connectionProvider: string;
  // ResponsesLite is structurally compatible with the OpenAILite surface the base class uses.
  protected client: any;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'openai', config = {} }: OpenAIProviderConfig) {
    super({ provider, config });

    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;
    this.client = new ResponsesLite({ apiKey: config.apiKey });
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

export default OpenAIProvider;
