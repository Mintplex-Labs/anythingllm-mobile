import BaseOpenAILikeProvider, { IStreamableResponse } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface OllamaProviderConfig {
  provider: string;
  config?: {
    baseURL?: string;
    model?: string;
    apiKey?: string;
  }
}

export interface OllamaModel {
  id: string;
  object: string;
  owned_by: string;
}

function ollamaBaseURLFormatter(baseURL?: string) {
  if (!baseURL) return '';
  try {
    const url = new URL(baseURL);
    url.pathname = '/v1';
    return url.href;
  } catch (error) {
    return baseURL;
  }
}

class OllamaProvider extends BaseOpenAILikeProvider {
  private baseURL: string = '';
  private apiKey: string | null = null;
  private modelCapabilities: { [modelName: string]: { tools: boolean } } = {};

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false; // always false for LMStudio
  public isExternalProvider: boolean = true;

  constructor({ provider = 'ollama', config = {} }: OllamaProviderConfig) {
    config.baseURL = ollamaBaseURLFormatter(config.baseURL);
    super({ provider, config });

    // Random other properties we may or may not need
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }

    if (config.baseURL) this.baseURL = ollamaBaseURLFormatter(config.baseURL);
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

  override async availableModels(): Promise<OllamaModel[]> {
    return await this.client.models.list()
      .then((models) => models.data.map((model: OllamaModel) => model))
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

  private async checkToolSupport(): Promise<boolean> {
    // Check cache if exists
    if (this.modelCapabilities[this.model]?.tools !== undefined) {
      return this.modelCapabilities[this.model].tools;
    }

    try {
      const url = new URL(this.baseURL);
      const apiBaseUrl = url.origin;
      const response = await fetch(`${apiBaseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: this.model }),
      });

      if (!response.ok) {
        this.log(`Failed to fetch model details for ${this.model}. Assuming no tool support.`);
        this.modelCapabilities[this.model] = { tools: false };
        return false;
      }

      const data = await response.json();
      const hasToolSupport = Array.isArray(data.capabilities) && data.capabilities.includes('tools');

      this.log(`Model ${this.model} tool support: ${hasToolSupport}`);
      this.modelCapabilities[this.model] = { tools: hasToolSupport };
      return hasToolSupport;
    } catch (error) {
      this.log(`Error checking tool support for ${this.model}:`, error);
      this.modelCapabilities[this.model] = { tools: false };
      return false;
    }
  }

  /*
   * Override for streamGetChatCompletion to check if the model supports tools.
   *
   * In Ollama, some models support tools so we need to check via the API
   * to see if the model supports tools. We must remove the tools from the request
   * if the model does not support tools or else Ollama will throw an error.
  */
  override async streamGetChatCompletion(messages: any[] = [], availableTools: any[] = []): Promise<IStreamableResponse> {
    const hasToolSupport = await this.checkToolSupport();
    const tools = hasToolSupport ? availableTools : [];

    if (!hasToolSupport && availableTools.length > 0) {
      this.log(`Model ${this.model} does not support tools, removing them from request.`);
    } else {
      this.log(`Model ${this.model} supports tools, adding them to request.`);
    }

    return super.streamGetChatCompletion(messages, tools);
  }
}

export default OllamaProvider;