import { defaultModels } from "@/utils/models";
import GenieWrapper, { IGenieStreamCallback } from "./genie";
import LlamaRnWrapper, { ILlamaRnStreamCallback, OnDeviceRuntimeInfo } from "./llamaRn";
import BaseOpenAILikeProvider, { IAvailableModel, ICompleteResponse, IStreamCallback, IStreamEvent } from "../baseOpenAILikeProvider";
import OpenAILite from "@/utils/openai";
import MODEL_CARDS, { EMBEDDING_MODEL } from "@/utils/models/defaults";
import { DEFAULT_GGUF_FOLDER } from "@/utils/models/manager";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import ToolsManager from "@/utils/ToolsManager";
import ImportedModels from "@/utils/models/imported";
import { throwIfAborted } from "@/utils/chat/abort";

export type IOnDeviceStreamCallback = IGenieStreamCallback | ILlamaRnStreamCallback;

/** Shape of an entry returned by `OnDeviceProvider.availableModels()` */
export type IOnDeviceAvailableModel = {
  id: string;
  modelId: string;
  name: string;
  description: string;
  size: number | string;
  downloadUrl: string;
  isPreset: boolean;
  /** Display name of the organisation behind the model (Google, IBM Research, ...). Used to group lists. */
  provider?: string;
  /** True when the model was found in storage but is not in any list we know about */
  isUnknown?: boolean;
  /** True when the user added this model from Hugging Face (see `utils/models/imported`) */
  isImported?: boolean;
  imageUrl?: string | null;
}
export type OnDeviceProviderConstructorProps = { config: { model: string | null } }

export default class OnDeviceProvider extends BaseOpenAILikeProvider {
  static instance: OnDeviceProvider;

  protected provider: string;
  protected config: any;
  protected computeRuntime: string = 'CPU';
  // @ts-ignore - this is a valid property for this class
  public model: string | null;

  protected submodule: GenieWrapper | LlamaRnWrapper | null = null;
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
      return new LlamaRnWrapper({ model, parent: this });
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

  /**
   * Runtime details of the currently loaded GGUF model (null when nothing is loaded).
   */
  get runtimeInfo(): OnDeviceRuntimeInfo | null {
    if (this.submodule instanceof LlamaRnWrapper) return this.submodule.runtimeInfo;
    return null;
  }

  /**
   * Interrupts the response currently being generated, if any.
   */
  async stopGeneration() {
    if (this.submodule instanceof LlamaRnWrapper) await this.submodule.stop();
  }

  /**
   * Streams one LLM round through the active runtime, forwarding the turn's abort
   * signal where the runtime supports interruption (llama.rn). Genie has no stop
   * hook - an abort there is honoured by the caller once the round returns.
   */
  private runSubmoduleStream(messages: any[], callback: (token: string) => void, availableTools: any[]): Promise<ICompleteResponse> {
    if (!this.submodule) throw new Error('No model loaded. Please select a model first.');
    if (this.submodule instanceof LlamaRnWrapper) return this.submodule.streamGetChatCompletion(messages, callback, availableTools, this.abortSignal);
    return this.submodule.streamGetChatCompletion(messages, callback);
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

  /**
   * Turns a storage folder name like "Lucy-gguf" or "Qwen3-1.7B-GGUF" into a
   * readable title like "Lucy" or "Qwen3 1.7B".
   */
  static humanizeModelFolderName(folderName: string) {
    return folderName
      .replace(/[-_.]?gguf$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }

  /**
   * Scans the gguf storage folder for models that are installed on the device
   * but are not part of any list we know about (eg: a model we removed from
   * the catalog, or one added by hand). These are returned as generic entries
   * so the user can still see, select and uninstall them.
   *
   * Storage layout is `models/gguf/<creator>/<model>/<file>.gguf`, mirroring
   * the HuggingFace url the file was downloaded from, so we can rebuild a url
   * that `resolveDestinationPathFromGGUFUrl` resolves back to the same path.
   */
  async discoverUnknownStoredModels(knownModelIds: string[]): Promise<IOnDeviceAvailableModel[]> {
    const known = new Set([...knownModelIds, EMBEDDING_MODEL.modelId]);
    // Imported models are keyed `org/repo/file.gguf`, so their folder is known by prefix.
    const knownFolders = new Set(
      [...known].map(id => (id.endsWith('.gguf') ? id.split('/').slice(0, 2).join('/') : id)),
    );
    const unknownModels: IOnDeviceAvailableModel[] = [];

    try {
      if (!(await RNFS.exists(DEFAULT_GGUF_FOLDER))) return [];
      const creators = (await RNFS.readDir(DEFAULT_GGUF_FOLDER)).filter(item => item.isDirectory());

      for (const creator of creators) {
        const modelDirs = (await RNFS.readDir(creator.path)).filter(item => item.isDirectory());
        for (const modelDir of modelDirs) {
          const modelId = `${creator.name}/${modelDir.name}`;
          if (knownFolders.has(modelId)) continue;

          const ggufFile = (await RNFS.readDir(modelDir.path)).find(file => file.isFile() && file.name.toLowerCase().endsWith('.gguf'));
          if (!ggufFile) continue;

          unknownModels.push({
            id: modelId,
            modelId,
            name: OnDeviceProvider.humanizeModelFolderName(modelDir.name),
            description: `Found on this device in ${modelId} but it is not in our model list. You can still use it or uninstall it.`,
            size: Number(ggufFile.size),
            downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${ggufFile.name}`,
            isPreset: false,
            isUnknown: true,
            imageUrl: null,
          });
        }
      }
    } catch (error) {
      this.log('Failed to scan storage for unknown models', error);
    }

    return unknownModels;
  }

  // @ts-ignore
  override async availableModels(): Promise<IOnDeviceAvailableModel[]> {
    const basicModels: IOnDeviceAvailableModel[] = MODEL_CARDS.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      size: m.size,
      modelId: m.modelId,
      downloadUrl: m.tag,
      isPreset: true,
    }));

    const crossPlatformModels: IOnDeviceAvailableModel[] = defaultModels
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
          provider: m.author,
          // @ts-ignore
          imageUrl: m.imageUrl ?? null,
        }
      });
    const importedModels: IOnDeviceAvailableModel[] = (await ImportedModels.list()).map(m => ({
      id: m.modelId,
      modelId: m.modelId,
      name: m.name,
      description: m.description,
      size: m.size,
      downloadUrl: m.downloadUrl,
      isPreset: false,
      isImported: true,
      provider: m.author,
      imageUrl: null,
    }));
    const knownModels = [...basicModels, ...crossPlatformModels, ...importedModels];
    const unknownModels = await this.discoverUnknownStoredModels(knownModels.map(m => m.modelId));
    return [
      ...knownModels,
      ...unknownModels,
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
    // Loading a GGUF into memory can take several seconds on first use - surface it in the
    // activity chain instead of leaving the user staring at an empty bubble.
    if (streaming && this.submodule instanceof LlamaRnWrapper && this.runtimeInfo === null) {
      onStream('report_status', 'Loading model into memory');
    }
    const { formattedMessages, citations } = await this.buildPrompt(messages, streaming ? (status) => onStream('report_status', status) : undefined);
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
    let fullResult = await this.runSubmoduleStream(formattedMessages as any, (token: string) => onStream('chunk', token), availableTools);
    // `stopCompletion` makes llama.rn return the partial text as a normal result - never
    // treat an aborted round as a finished reply (no tool calls, no completion event).
    throwIfAborted(this.abortSignal);

    // Recursive tool call loop
    await ToolsManager.toolCallLoop({
      currentResponse: fullResult,
      runStreamCompletion: async (messages: any[], callback: IOnDeviceStreamCallback | IStreamCallback, availableTools: any[]) => {
        const result = await this.runSubmoduleStream(messages, callback as any, availableTools);
        throwIfAborted(this.abortSignal);
        return result;
      },
      streamEmitter: (event: IStreamEvent, data: any) => onStream(event, data),
      currentMessageHistory: formattedMessages,
      signal: this.abortSignal,
    });

    throwIfAborted(this.abortSignal);
    if (!!fullResult.metrics) onStream('report_metrics', fullResult.metrics);
    if (!!citations) onStream('report_citations', citations);
    onStream('complete', '');
  }
}