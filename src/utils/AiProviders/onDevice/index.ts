import { defaultModels } from "@/utils/models";
import GenieWrapper, { IGenieStreamCallback } from "./genie";
import LlamaRnWrapper, { ILlamaRnStreamCallback } from "./llamaRn";
import BaseOpenAILikeProvider, { ICompleteResponse, IStreamCallback, IStreamEvent } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";
import MODEL_CARDS from "@/utils/models/defaults";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import ToolsManager from "@/utils/ToolsManager";

export type IOnDeviceStreamCallback = IGenieStreamCallback | ILlamaRnStreamCallback;
export type OnDeviceProviderConstructorProps = { config: { model: string } }

export default class OnDeviceProvider extends BaseOpenAILikeProvider {
  static instance: OnDeviceProvider;

  protected provider: string;
  protected config: any;
  protected computeRuntime: string = 'CPU';
  public model: string;
  protected submodule: GenieWrapper | LlamaRnWrapper;
  protected llamaRnContext: any;

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
    this.computeRuntime = this.determineComputeRuntime(this.config.model);
    this.model = this.config.model;

    this.submodule = this.setSubmodule(this.model);
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

  private setSubmodule(model: string) {
    if (!model) throw new Error('No model provided to setSubmodule');
    if (this.computeRuntime === 'NPU') {
      this.submodule = new GenieWrapper({ model, parent: this });
    } else {
      this.submodule = new LlamaRnWrapper({ model, parent: this });
    }
    return this.submodule;
  }

  static getInstance(props: OnDeviceProviderConstructorProps) {
    if (!OnDeviceProvider.instance) OnDeviceProvider.instance = new OnDeviceProvider(props);
    return OnDeviceProvider.instance;
  }

  /**
   * Delegates to the submodule to cleanup the model.
   */
  async unloadModel() {
    await this.submodule.cleanup();
  }

  get name() {
    return this.provider;
  }

  async loadNewModel(model: string) {
    if (!model) return this.log('No model provided to loadNewModel - skipping.');

    if (this.model === model) return;
    this.model = model;
    this.computeRuntime = this.determineComputeRuntime(this.model);
    await this.submodule.cleanup();
    this.submodule = this.setSubmodule(this.model);
    this.log(`${this.name}::${this.submodule.name} re-initialized with model ${this.model}`);
  }

  availableModels() {
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
    return this.submodule.getChatCompletion(messages);
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
    let fullResult = await this.submodule.streamGetChatCompletion(formattedMessages as any, (token: string) => onStream('chunk', token), availableTools);

    // Recursive tool call loop
    await ToolsManager.toolCallLoop({
      currentResponse: fullResult,
      runStreamCompletion: (messages: any[], callback: IOnDeviceStreamCallback, availableTools: any[]) => this.submodule.streamGetChatCompletion(messages, callback, availableTools),
      streamEmitter: (event: IStreamEvent, data: any) => onStream(event, data),
      currentMessageHistory: formattedMessages,
    });

    // Single tool call loop
    // If the model supports tool calls we can delegate the execution to the ToolsManager
    // if (fullResult.toolCalls) {
    //   const toolCallCompletedMessages = await ToolsManager.manageToolCallExecutions(fullResult.toolCalls, onStream, formattedMessages);
    //   fullResult = await this.submodule.streamGetChatCompletion(toolCallCompletedMessages as any, (token: string) => onStream('chunk', token), await ToolsManager.injectAvailableTools());
    // }

    if (!!fullResult.metrics) onStream('report_metrics', fullResult.metrics);
    if (!!citations) onStream('report_citations', citations); // Reports document citations - will be merged
    onStream('complete', '');
  }
}