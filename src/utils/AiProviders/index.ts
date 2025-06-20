import OpenAICompatible from "./openAICompatible";
import OnDeviceProvider from "./onDevice";

export type LLMProvider = OpenAICompatible | OnDeviceProvider;
function getLLM(provider: string, config: { [key: string]: any } = {}): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAICompatible({
        provider: 'openai',
        config: {
          apiKey: config.apiKey,
          modelId: config.modelId,
        }
      });
    case 'native':
      return OnDeviceProvider.getInstance({
        config: { model: config.model }
      })
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

export default getLLM;