import BaseOpenAILikeProvider, { IAvailableModel, IStreamableResponse } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface LlmmanProviderConfig {
  provider: string;
  config?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  }
}

/**
 * llmman serves its OpenAI-compatible API under `/v1` and its Ollama-compatible API under `/api`
 * on the same host (default `http://127.0.0.1:17434`), so normalize whatever the user typed to `/v1`.
 */
function llmmanBaseURLFormatter(baseURL?: string) {
  if (!baseURL) return '';
  try {
    const url = new URL(baseURL);
    url.pathname = '/v1';
    return url.href;
  } catch (error) {
    return baseURL;
  }
}

/**
 * llmman (https://github.com/llmmanorg/llmman) - self-hosted server that speaks the Ollama, OpenAI and
 * Anthropic APIs. The desktop server talks to it over the Ollama API; here we chat over the OpenAI-compatible
 * `/v1` endpoint like every other provider and only use the Ollama-style `/api/*` routes for model discovery
 * and capability checks - the same split as our Ollama provider.
 *
 * The API key is optional: llmman requires one on every request when the daemon is reachable over the
 * network (`LLMMAN_API_KEYS`) and it is sent as a `Bearer` token.
 */
class LlmmanProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private baseURL: string = '';
  private apiKey: string | null = null;
  private modelCapabilities: { [modelName: string]: { tools: boolean } } = {};

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'llmman', config = {} }: LlmmanProviderConfig) {
    super({ provider, config });

    if (config.baseURL) this.baseURL = llmmanBaseURLFormatter(config.baseURL);
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

  private get apiHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
    };
  }

  /** Origin of the configured server - the Ollama-style `/api/*` routes are not under `/v1`. */
  private get apiOrigin(): string {
    return new URL(this.baseURL).origin;
  }

  /**
   * Lists the models llmman is serving via the Ollama API's `/api/tags` (same as the desktop server).
   * Response shape: `{ models: [{ name, model, details: { family, ... } }] }` - mapped to the OpenAI style
   * `{ id, object, owned_by }` every other provider returns. Falls back to `/v1/models` if that route fails.
   */
  override async availableModels(): Promise<IAvailableModel[]> {
    try {
      if (!this.baseURL) throw new Error('No base URL configured');
      const res = await fetch(`${this.apiOrigin}/api/tags`, { method: 'GET', headers: this.apiHeaders });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data: { models?: { name?: string; model?: string; details?: { family?: string } }[] } = await res.json();
      if (!Array.isArray(data?.models)) throw new Error('Response did not contain a "models" array.');
      return data.models
        .map((model) => ({
          id: model.name || model.model || '',
          object: 'model',
          owned_by: model.details?.family || 'llmman',
        }))
        .filter((model) => !!model.id);
    } catch (error) {
      this.log(`Error fetching models from /api/tags, trying /v1/models: ${error}`);
      return await this.client.models.list()
        .then((models) => models.data)
        .catch((fallbackError) => {
          this.log(`Error fetching models: ${fallbackError}`);
          return [];
        });
    }
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

  /**
   * Fetches the model details (capabilities, etc) from llmman's Ollama-compatible `/api/show` route
   * so we know whether the model can take tools before we send any.
   */
  private async getModelDetails(modelTag: string = this.model): Promise<{ capabilities?: string[] } | null> {
    try {
      const res = await fetch(`${this.apiOrigin}/api/show`, {
        method: 'POST',
        headers: this.apiHeaders,
        body: JSON.stringify({ model: modelTag }),
      });
      if (!res.ok) throw new Error(`Failed to fetch model details for ${modelTag} (status ${res.status}).`);
      return await res.json();
    } catch (error) {
      this.log(`Error checking model details for ${modelTag}:`, error);
      return null;
    }
  }

  /**
   * Whether the current model advertises the `tools` capability. Mirrors the desktop llmman provider, which
   * only enables native tool calling when the model reports it; otherwise tools are stripped from the request.
   */
  private async checkToolSupport(): Promise<boolean> {
    if (this.modelCapabilities[this.model]?.tools !== undefined) return this.modelCapabilities[this.model].tools;

    const details = await this.getModelDetails(this.model);
    const hasToolSupport = details?.capabilities?.includes('tools') || false;
    this.modelCapabilities[this.model] = { tools: hasToolSupport };
    return hasToolSupport;
  }

  override async streamGetChatCompletion(messages: any[] = [], availableTools: any[] = []): Promise<IStreamableResponse> {
    let tools = availableTools;
    if (availableTools.length > 0 && !(await this.checkToolSupport())) {
      this.log(`Model ${this.model} does not support tools, removing them from request.`);
      tools = [];
    }

    return super.streamGetChatCompletion(messages, tools);
  }
}

export default LlmmanProvider;
