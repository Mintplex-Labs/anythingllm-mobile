import BaseOpenAILikeProvider, { IAvailableModel } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";

export interface BedrockProviderConfig {
  provider: string;
  config?: {
    apiKey?: string;
    region?: string;
    model?: string;
  }
}

export const BEDROCK_DEFAULT_REGION = 'us-west-2';

/**
 * Regions that support the bedrock-mantle API endpoint.
 * Source: https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints-region-availability.html
 * Mirrors `frontend/src/components/LLMSelection/AwsBedrockLLMOptions/regions.js` in the desktop app.
 */
export const BEDROCK_REGIONS: { name: string; code: string }[] = [
  { name: 'US East (N. Virginia)', code: 'us-east-1' },
  { name: 'US East (Ohio)', code: 'us-east-2' },
  { name: 'US West (Oregon)', code: 'us-west-2' },
  { name: 'EU (Frankfurt)', code: 'eu-central-1' },
  { name: 'EU (Stockholm)', code: 'eu-north-1' },
  { name: 'EU (Milan)', code: 'eu-south-1' },
  { name: 'EU (Ireland)', code: 'eu-west-1' },
  { name: 'EU (London)', code: 'eu-west-2' },
  { name: 'Asia Pacific (Tokyo)', code: 'ap-northeast-1' },
  { name: 'Asia Pacific (Mumbai)', code: 'ap-south-1' },
  { name: 'Asia Pacific (Sydney)', code: 'ap-southeast-2' },
  { name: 'Asia Pacific (Jakarta)', code: 'ap-southeast-3' },
  { name: 'South America (São Paulo)', code: 'sa-east-1' },
  { name: 'AWS GovCloud (US-West)', code: 'us-gov-west-1' },
];

/**
 * The Bedrock Mantle host is the OpenAI-compatible catalog (`/v1/chat/completions`, `/v1/models`)
 * that accepts a Bedrock API key as a bearer token. See `server/utils/AiProviders/bedrock/endpoints.js`
 * in the desktop app.
 */
export function bedrockOpenAIBaseURL(region: string) {
  return `https://bedrock-mantle.${region}.api.aws/v1`;
}

/**
 * Anthropic models on Bedrock are only served through the Anthropic Messages route, which does not
 * work from the mobile client - they are hidden from the picker. Everything else goes through Mantle.
 */
export function isBedrockAnthropicModel(modelId: string = '') {
  const id = modelId.toLowerCase();
  return id.includes('anthropic') || id.includes('claude');
}

/**
 * AWS Bedrock - authenticates with a Bedrock API key against the OpenAI-compatible Mantle endpoint
 * for the configured region. Only the API key, region and model are configurable.
 */
class BedrockProvider extends BaseOpenAILikeProvider {
  public isExternalProvider: boolean = true;
  private apiKey: string | null = null;
  private region: string = BEDROCK_DEFAULT_REGION;

  public model: string;
  private connectionProvider: string;
  protected client: OpenAILite;
  protected temperature: number = 0.7;
  protected isOTypeModel: boolean = false;

  constructor({ provider = 'bedrock', config = {} }: BedrockProviderConfig) {
    super({ provider, config });

    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.region) this.region = config.region.trim();
    this.model = config.model || 'Unknown Model';
    this.connectionProvider = provider;

    this.client = new OpenAILite({
      apiKey: this.apiKey,
      baseURL: bedrockOpenAIBaseURL(this.region),
    });
    this.log(`${this.connectionProvider} initialized with model ${this.model} in ${this.region}`);
  }

  protected log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  }

  override async availableModels(): Promise<IAvailableModel[]> {
    return await this.client.models.list()
      .then((models) => models.data
        // Claude is not reachable through the OpenAI-compatible route - see isBedrockAnthropicModel.
        .filter((model: IAvailableModel) => !!model?.id && !isBedrockAnthropicModel(model.id))
        .map((model: IAvailableModel) => ({ ...model, owned_by: model.owned_by ?? 'AWS Bedrock' }))
        .sort((a: IAvailableModel, b: IAvailableModel) => a.id.localeCompare(b.id)))
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

export default BedrockProvider;
