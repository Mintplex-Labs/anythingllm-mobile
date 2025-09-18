import OpenAICompatible from "./openAICompatible";
import OnDeviceProvider from "./onDevice";
import LMStudioProvider from "./LMStudioProvider";
import OllamaProvider from "./OllamaProvider";
import OpenRouterProvider from "./OpenRouterProvider";

export type LLMProvider = OpenAICompatible |
  OnDeviceProvider |
  LMStudioProvider |
  OllamaProvider |
  OpenRouterProvider;

function getLLM(provider: string, config: { [key: string]: any } = {}): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAICompatible({
        provider: 'openai',
        config: {
          apiKey: config.apiKey,
          model: config.model,
        }
      });
    case 'openrouter':
      return new OpenRouterProvider({
        provider: 'openrouter',
        config: {
          apiKey: config.apiKey,
          model: config.model,
        }
      });
    case 'generic-openai':
      return new OpenAICompatible({
        provider: 'generic-openai',
        config: {
          baseURL: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
        }
      });
    case 'lmstudio':
      return new LMStudioProvider({
        provider: 'lmstudio',
        config: {
          baseURL: config.baseUrl,
          model: config.model,
        }
      });
    case 'ollama':
      return new OllamaProvider({
        provider: 'ollama',
        config: {
          baseURL: config.baseUrl,
          model: config.model,
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