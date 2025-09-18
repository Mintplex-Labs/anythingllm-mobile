import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import { OpenAICompatibleModel } from "../openAICompatible";
import OpenAILite from "@/utils/openai";

export interface OpenRouterProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    model?: string;
  }
}

export interface OpenRouterAPIModel {
  id: string;
  canonical_slug: string;
  hugging_face_id: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  per_request_limits: any;
  supported_parameters: string[];
}

class OpenRouterProvider extends BaseOpenAILikeProvider {
  private baseURL: string = 'https://openrouter.ai/api/v1';
  private apiKey: string | null = null;

  public model: string;
  private connectionProvider: string;
  protected client;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'OpenRouterProvider', config = {} }: OpenRouterProviderConfig) {
    super({ provider, config });

    // Random other properties we may or may not need
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }

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
      .then((models) => models.data.map((model: OpenRouterAPIModel) => {
        const isFree = Object.values(model?.pricing || {}).every(price => Number(price) === 0);
        const suffix = isFree && !model.name.toLowerCase().includes('free') ? ' (Free)' : '';
        return {
          ...model,
          // @ts-ignore
          name: `${model.name}${suffix}`,
        };
      }))
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

export default OpenRouterProvider;