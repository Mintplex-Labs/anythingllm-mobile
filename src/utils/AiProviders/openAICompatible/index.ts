import BaseOpenAILikeProvider from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface OpenAICompatibleConfig {
  provider: string;
  config?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
    isOTypeModel?: boolean;
  }
}

export interface OpenAICompatibleModel {
  id: string;
  object: string;
  owned_by: string;
}

class OpenAICompatible extends BaseOpenAILikeProvider {
  private baseURL: string = 'https://api.openai.com/v1';
  private apiKey: string | null = null;
  public isExternalProvider: boolean = true;

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
    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;

    this.client = new OpenAILite({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
    this.log(`${this.connectionProvider} initialized with model ${this.model}`);
  }

  /**
   * gpt-5 models default `reasoning_effort` to a non-`none` level and then refuse function tools on
   * `/v1/chat/completions` ("Function tools with reasoning_effort are not supported ... set
   * reasoning_effort to 'none'"). Older models reject the parameter entirely, so it is only sent for
   * gpt-5 models, only when tools are in the request, and only against OpenAI itself - a generic
   * OpenAI-compatible server may not know the field.
   */
  protected override extraRequestParams(hasTools: boolean = false): Record<string, any> {
    if (!hasTools || this.connectionProvider !== 'openai') return {};
    if (!/^gpt-5/i.test(this.model)) return {};
    return { reasoning_effort: 'none' };
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  override async availableModels(): Promise<OpenAICompatibleModel[]> {
    return await this.client.models.list()
      .then((models) => models.data.map((model: OpenAICompatibleModel) => model))
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

export default OpenAICompatible;