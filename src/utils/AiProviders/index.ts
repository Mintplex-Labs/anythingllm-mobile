import OpenAICompatible from "./openAICompatible";
import OnDeviceProvider from "./onDevice";
function getLLM(provider: string, config: { [key: string]: any } = {}) {
  // temp
  return new OnDeviceProvider({
    provider: 'genie',
    config: { model: 'Qwen/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf' }
  })

  switch (provider) {
    case 'openai':
      return new OpenAICompatible({
        provider: 'openai',
        config: {
          apiKey: config.apiKey,
          modelId: config.modelId,
        }
      });
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

export default getLLM;