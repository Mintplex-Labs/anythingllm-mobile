import { defaultModels } from "@/utils/models";
import GenieWrapper, { IGenieStreamCallback } from "./genie";
import CactusLmWrapper, { ICactusLmStreamCallback } from "./cactus";
import BaseOpenAILikeProvider, { IAvailableModel, ICompleteResponse, IStreamCallback, IStreamEvent } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";
import MODEL_CARDS from "@/utils/models/defaults";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import ToolsManager from "@/utils/ToolsManager";

export type IOnDeviceStreamCallback = IGenieStreamCallback | ICactusLmStreamCallback;
export type OnDeviceProviderConstructorProps = { config: { model: string | null } }

export default class OnDeviceProvider extends BaseOpenAILikeProvider {
  static instance: OnDeviceProvider;

  protected provider: string;
  protected config: any;
  protected computeRuntime: string = 'CPU';
  // @ts-ignore - this is a valid property for this class
  public model: string | null;

  protected submodule: GenieWrapper | CactusLmWrapper | null = null;
  protected client: OpenAILite;
  protected isOTypeModel: boolean;
  protected temperature: number;

  constructor({ config }: OnDeviceProviderConstructorProps) {
    super({ provider: 'native', config });

    // For compilance with the base class - we stub it here.
    this.client = new OpenAILite();
    this.isOTypeModel = false;
    this.temperature = 0.7;

    this.provider = 'native';
    this.config = config;
    this.model = this.config.model;
    this.computeRuntime = this.determineComputeRuntime(this.model);

    if (this.model) {
      this.submodule = this.setSubmodule(this.model);
      this.log(`${this.name}::${this.submodule.name} initialized with model ${this.model}`);
    }
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}:${this.submodule?.name || 'no-model'}]\x1b[0m ${text}`, ...args);
  }

  determineComputeRuntime = (modelName: string | null) => {
    if (!modelName) return 'CPU';
    if (modelName.endsWith('.gguf')) return 'CPU';
    const definition = defaultModels.find(m => m.id === modelName);
    return definition?.runtime || 'CPU';
  }

  private setSubmodule(model: string) {
    if (!model) throw new Error('No model provided to setSubmodule');
    if (this.computeRuntime === 'NPU') {
      return new GenieWrapper({ model, parent: this });
    } else {
      return new CactusLmWrapper({ model, parent: this });
    }
  }

  static getInstance(props: OnDeviceProviderConstructorProps) {
    if (!OnDeviceProvider.instance) OnDeviceProvider.instance = new OnDeviceProvider(props);
    return OnDeviceProvider.instance;
  }

  /**
   * Delegates to the submodule to cleanup the model.
   */
  async unloadModel() {
    if (this.submodule) {
      await this.submodule.cleanup();
    }
  }

  get name() {
    return this.provider;
  }

  async loadNewModel(model: string | null) {
    if (!model) {
      this.log('No model provided to loadNewModel - cleaning up.');
      if (this.submodule) {
        await this.submodule.cleanup();
        this.submodule = null;
      }
      this.model = null;
      return;
    }

    if (this.model === model) return;
    this.model = model;
    this.computeRuntime = this.determineComputeRuntime(this.model);
    if (this.submodule) {
      await this.submodule.cleanup();
    }
    this.submodule = this.setSubmodule(this.model);
    this.log(`${this.name}::${this.submodule.name} re-initialized with model ${this.model}`);
  }

  // @ts-ignore
  override async availableModels(): Promise<object[]> {
    const basicModels = MODEL_CARDS.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      size: m.size,
      modelId: m.modelId,
      downloadUrl: m.tag,
      isPreset: true,
    }));

    const crossPlatformModels = defaultModels
      .filter(m => m.runtime === 'CPU')
      .map(m => ({ ...m, id: m.id.endsWith('.gguf') ? m.id.split('/').slice(0, -1).join('/') : m.id }))
      .map(m => {
        return {
          id: m.id,
          // @ts-ignore
          description: m.description || '',
          name: m.name,
          size: m.size,
          modelId: m.id,
          downloadUrl: m.downloadUrl || '',
          isPreset: false,
          // @ts-ignore
          imageUrl: m.imageUrl ?? null,
        }
      });
    return [
      ...basicModels,
      ...crossPlatformModels
    ];
  }

  async runBasicChatCompletion(messages: any[]): Promise<ICompleteResponse> {
    return this.submodule!.getChatCompletion(messages);
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
    if (!this.submodule || !this.model) throw new Error('No model loaded. Please select a model first.');
    const { formattedMessages, citations } = await this.buildPrompt(messages);
    if (!streaming) {
      const response = await this.submodule.getChatCompletion(formattedMessages as any);
      onComplete({
        textResponse: response.textResponse,
        metrics: response.metrics,
      });
      return;
    }

    const availableTools = await ToolsManager.injectAvailableTools();
    this.log(`Streaming ${this.model} with ${this.computeRuntime}`);
    this.log('Available tools:', availableTools.map(t => t.function.name));
    let fullResult = await this.submodule.streamGetChatCompletion(formattedMessages as any, (token: string) => onStream('chunk', token), availableTools);

    // Recursive tool call loop
    await ToolsManager.toolCallLoop({
      currentResponse: fullResult,
      runStreamCompletion: (messages: any[], callback: IOnDeviceStreamCallback | IStreamCallback, availableTools: any[]) => this.submodule!.streamGetChatCompletion(messages, callback as any, availableTools),
      streamEmitter: (event: IStreamEvent, data: any) => onStream(event, data),
      currentMessageHistory: formattedMessages,
    });

    if (!!fullResult.metrics) onStream('report_metrics', fullResult.metrics);
    if (!!citations) onStream('report_citations', citations);
    onStream('complete', '');
  }
}