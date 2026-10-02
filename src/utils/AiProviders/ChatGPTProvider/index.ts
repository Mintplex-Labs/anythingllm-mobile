import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import ResponsesLite from "@/utils/openaiResponses";
import chatgptAuth from "@/utils/chatgpt/auth";

export interface ChatGPTProviderConfig {
  provider: string;
  config?: {
    model?: string;
  }
}

/**
 * ChatGPT - OpenAI models billed to the user's ChatGPT Plus/Pro plan through Sign in with ChatGPT.
 * Uses the Responses API via `ResponsesLite` in plan usage mode. There is no API key: every request pulls a
 * fresh OAuth token from `chatgptAuth`.
 */
class ChatGPTProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;

  public model: string;
  private connectionProvider: string;
  // ResponsesLite is structurally compatible with the OpenAILite surface the base class uses.
  protected client: any;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'chatgpt', config = {} }: ChatGPTProviderConfig) {
    super({ provider, config });

    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;
    this.client = new ResponsesLite({
      planUsage: true,
      getAccessToken: (options) => chatgptAuth.getAccessToken(options),
    });
    this.log(`${this.connectionProvider} initialized with model ${this.model}`);
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  /** Plan usage rejects `temperature` - the model default applies. */
  protected override supportsTemperature(): boolean {
    return false;
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

export default ChatGPTProvider;
