import { defaultModels } from "@/utils/models";
import GenieWrapper, { IGenieStreamCallback } from "./genie";
import LlamaRnWrapper, { ILlamaRnStreamCallback } from "./llamaRn";
import BaseOpenAILikeProvider, { IStreamCallback } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";
import MODEL_CARDS from "@/utils/defaultModels";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";

export type IOnDeviceStreamCallback = IGenieStreamCallback | ILlamaRnStreamCallback;

export default class OnDeviceProvider extends BaseOpenAILikeProvider {
  protected provider: string;
  protected config: any;
  protected computeRuntime: string = 'CPU';
  public model: string;
  protected submodule: GenieWrapper | LlamaRnWrapper;
  protected llamaRnContext: any;

  protected client: OpenAILite;
  protected isOTypeModel: boolean;
  protected temperature: number;

  constructor({ provider = 'ondevice', config = {} }: { provider?: string, config?: any }) {
    super({ provider, config });

    // For compilance with the base class - we stub it here.
    this.client = new OpenAILite();
    this.isOTypeModel = false;
    this.temperature = 0.7;

    this.provider = provider;
    this.config = config;
    this.computeRuntime = this.determineComputeRuntime(this.config.model);
    this.model = this.config.model;

    if (this.computeRuntime === 'NPU') this.submodule = new GenieWrapper({ model: this.model });
    else this.submodule = new LlamaRnWrapper({ model: this.model });
    this.log(`${this.name}::${this.submodule.name} initialized with model ${this.model}`);
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}:${this.submodule.name}]\x1b[0m ${text}`, ...args);
  }

  determineComputeRuntime = (modelName: string) => {
    if (modelName.endsWith('.gguf')) return 'CPU';
    const definition = defaultModels.find(m => m.id === modelName);
    return definition?.runtime || 'CPU';
  }

  get name() {
    return this.provider;
  }

  availableModels() {
    const basicModels = MODEL_CARDS.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      size: m.size,
      modelId: m.modelId,
      downloadUrl: m.tag,
    }));
    const crossPlatformModels = defaultModels
      .filter(m => m.runtime === 'CPU')
      .map(m => ({ ...m, id: m.id.endsWith('.gguf') ? m.id.split('/').slice(0, -1).join('/') : m.id }))
      .map(m => {
        return {
          id: m.id,
          name: m.name,
          size: m.size,
          modelId: m.id,
          downloadUrl: m.downloadUrl || '',
        }
      });
    return [
      ...basicModels,
      ...crossPlatformModels
    ];
  }

  override async chat({
    messages,
    streaming = false,
    onComplete = () => { },
    onStream = () => { },
  }: {
    messages: DynamicChatMessage[];
    streaming?: boolean;
    onComplete?: (response: any) => void;
    onStream?: IStreamCallback | IOnDeviceStreamCallback;
  }) {
    const normalizedMessages = this.buildPrompt(messages);
    if (!streaming) {
      const response = await this.submodule.getChatCompletion(normalizedMessages as any);
      onComplete({
        textResponse: response.textResponse,
        metrics: response.metrics,
      });
      return;
    }

    this.log(`Streaming ${this.model} with ${this.computeRuntime}`);
    await this.submodule.streamGetChatCompletion(normalizedMessages as any, (token: string) => onStream('chunk', token));
    onStream('complete', '');
  }
}