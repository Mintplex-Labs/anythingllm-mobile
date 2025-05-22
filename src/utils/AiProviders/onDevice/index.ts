import { defaultModels } from "@/utils/models";

export default class OnDeviceProvider {
  protected provider: string;
  protected config: any;
  protected computeRuntime: string = 'CPU';
  protected model: string;
  protected llamaRnContext: any;

  constructor({ provider = 'OnDevice', config = {} }: { provider?: string, config?: any }) {
    this.provider = provider;
    this.config = config;
    this.computeRuntime = defaultModels.find(model => model.id === this.config.model)?.runtime || 'CPU';
    this.model = this.config.model;
  }

  /**
  * Returns the name of the provider.
  */
  get name() {
    return this.provider;
  }

  get modeDefinition() {
    return defaultModels.find(model => model.id === this.config.model);
  }


  defaultSystemMessage() {
    return 'You are a helpful assistant that can answer questions and help with tasks.';
  }

  public async chat(messages: any[]) {
  }
}